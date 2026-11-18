<?php

namespace App\Rules;

use App\Services\Documents\ContractDocumentDataRegistry;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

final class TiptapDocumentContent implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_array($value) || $value === []) {
            $fail('Der Report benötigt mindestens einen editierbaren Inhaltsblock.');
            return;
        }

        $allowedNodes = [
            'paragraph', 'heading', 'text', 'hardBreak', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'horizontalRule',
            'table', 'tableRow', 'tableCell', 'tableHeader', 'variable', 'pageBreak', 'relationTable', 'signatureBlock',
            'documentFormat', 'pageHeader', 'pageFooter',
        ];
        $allowedMarks = ['bold', 'italic', 'underline', 'strike', 'link'];
        $allowedRelations = ContractDocumentDataRegistry::relationSources();
        $nodes = 0;
        $chromeCounts = ['documentFormat' => 0, 'pageHeader' => 0, 'pageFooter' => 0];

        $walk = function (mixed $node, int $depth = 0) use (&$walk, &$nodes, &$chromeCounts, $allowedNodes, $allowedMarks, $allowedRelations, $fail): bool {
            if (! is_array($node) || $depth > 24 || ++$nodes > 20000) {
                $fail('Der Tiptap-Inhalt ist zu groß oder zu tief verschachtelt.');
                return false;
            }

            $type = $node['type'] ?? null;
            if (! is_string($type) || ! in_array($type, $allowedNodes, true)) {
                $fail('Der Tiptap-Inhalt enthält einen nicht unterstützten Baustein.');
                return false;
            }

            if (array_key_exists($type, $chromeCounts)) {
                $chromeCounts[$type]++;
                if ($chromeCounts[$type] > 1) {
                    $fail('Kopfzeile, Fußzeile und Dokumentformat dürfen jeweils nur einmal vorkommen.');
                    return false;
                }

                $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
                $fontFamily = (string) ($attrs['fontFamily'] ?? 'Helvetica');
                if (! in_array($fontFamily, ['Helvetica', 'Times', 'Courier'], true)) {
                    $fail('Die gewählte PDF-Schrift wird nicht unterstützt.');
                    return false;
                }
                if (isset($attrs['fontSize']) && (! is_numeric($attrs['fontSize']) || (float) $attrs['fontSize'] < 5 || (float) $attrs['fontSize'] > 32)) {
                    $fail('Die Schriftgröße der Papierzone ist ungültig.');
                    return false;
                }
                if (in_array($type, ['pageHeader', 'pageFooter'], true)) {
                    $align = (string) ($attrs['align'] ?? ($type === 'pageHeader' ? 'right' : 'left'));
                    if (! in_array($align, ['left', 'center', 'right'], true)) {
                        $fail('Die Ausrichtung der Papierzone ist ungültig.');
                        return false;
                    }
                }
                if ($type === 'pageFooter') {
                    if (isset($attrs['pageNumberFormat']) && (! is_string($attrs['pageNumberFormat']) || mb_strlen($attrs['pageNumberFormat']) > 80)) {
                        $fail('Das Seitenzahlenformat ist ungültig.');
                        return false;
                    }
                    $numberAlign = (string) ($attrs['pageNumberAlign'] ?? 'right');
                    if (! in_array($numberAlign, ['left', 'center', 'right'], true)) {
                        $fail('Die Ausrichtung der Seitenzahlen ist ungültig.');
                        return false;
                    }
                }
            }

            if ($type === 'text' && mb_strlen((string) ($node['text'] ?? '')) > 200000) {
                $fail('Ein Textbaustein ist zu lang.');
                return false;
            }

            if ($type === 'variable') {
                $path = data_get($node, 'attrs.path');
                if (! is_string($path) || ! preg_match('/^[A-Za-z0-9_.-]{1,120}$/', $path)) {
                    $fail('Eine Dokumentvariable besitzt keinen gültigen Pfad.');
                    return false;
                }
            }

            if ($type === 'relationTable') {
                $source = data_get($node, 'attrs.source');
                $columns = data_get($node, 'attrs.columns');
                if (! is_string($source) || ! in_array($source, $allowedRelations, true)) {
                    $fail('Die Daten-Tabelle verwendet eine nicht freigegebene Relation.');
                    return false;
                }
                if (! is_array($columns) || $columns === [] || count($columns) > 12) {
                    $fail('Eine Daten-Tabelle benötigt zwischen 1 und 12 Spalten.');
                    return false;
                }
                foreach ($columns as $column) {
                    if (! is_array($column)
                        || ! is_string($column['key'] ?? null)
                        || ! preg_match('/^[A-Za-z0-9_.-]{1,80}$/', (string) $column['key'])
                        || ! is_string($column['label'] ?? null)
                        || mb_strlen((string) $column['label']) > 80) {
                        $fail('Eine Spalte der Daten-Tabelle ist ungültig.');
                        return false;
                    }
                }
            }

            if ($type === 'signatureBlock') {
                foreach (['locationPath', 'datePath', 'leftNamePath', 'rightNamePath'] as $pathAttribute) {
                    $path = data_get($node, 'attrs.'.$pathAttribute);
                    if (! in_array($pathAttribute, ['locationPath', 'datePath'], true) && ($path === null || $path === '')) continue;
                    if (! is_string($path) || ! preg_match('/^[A-Za-z0-9_.-]{1,120}$/', $path)) {
                        $fail('Der Unterschriftenblock enthält einen ungültigen Variablenpfad.');
                        return false;
                    }
                }
            }

            foreach (($node['marks'] ?? []) as $mark) {
                if (! is_array($mark) || ! in_array($mark['type'] ?? null, $allowedMarks, true)) {
                    $fail('Der Tiptap-Inhalt enthält eine nicht unterstützte Textformatierung.');
                    return false;
                }
            }

            foreach (($node['content'] ?? []) as $child) {
                if (! $walk($child, $depth + 1)) return false;
            }

            return true;
        };

        foreach ($value as $node) {
            if (! $walk($node)) return;
        }
    }
}
