<?php

namespace App\Reports;

use App\Models\DocumentTemplate;
use App\Models\Letter;
use App\Services\Documents\DocumentProfessionalLayoutPolicy;
use App\Services\Documents\TiptapFpdfRenderer;

final class LetterPdfReport
{
    public function __construct(
        private readonly TiptapFpdfRenderer $renderer,
        private readonly DocumentProfessionalLayoutPolicy $layoutPolicy,
    ) {}

    public function render(Letter $letter, array $recipient, array $organization, array $content): string
    {
        return $this->renderSnapshot(
            organization: $organization,
            recipient: $recipient,
            letterDate: $letter->letter_date?->format('d.m.Y') ?? '',
            subjectText: trim((string) ($content['subject'] ?? '')),
            salutation: trim((string) ($content['salutation'] ?? '')),
            tiptapContent: is_array($content['tiptapContent'] ?? null) ? $content['tiptapContent'] : [],
            yourReference: filled($content['yourReference'] ?? null) ? (string) $content['yourReference'] : null,
            ourReference: filled($content['ourReference'] ?? null) ? (string) $content['ourReference'] : null,
            deliveryNote: $this->deliveryNote($letter),
            deliveryTargetLabel: $this->deliveryTargetLabel($letter->delivery_method),
            deliveryTargets: (array) ($recipient['deliveryTargets'] ?? []),
            salutationEmbeddedInBody: (bool) ($content['salutationEmbeddedInBody'] ?? false),
            footerOptions: ['reference' => trim('Brief '.($letter->number ?: 'Entwurf'))],
        );
    }

    /** @param array<string, mixed> $organization @param array<string, mixed> $recipient @param array<int, array<string,mixed>> $tiptapContent */
    public function renderSnapshot(
        array $organization,
        array $recipient,
        string $letterDate,
        string $subjectText,
        string $salutation,
        array $tiptapContent,
        ?string $yourReference = null,
        ?string $ourReference = null,
        ?string $deliveryNote = null,
        bool $salutationEmbeddedInBody = false,
        ?string $deliveryTargetLabel = null,
        array $deliveryTargets = [],
        array $footerOptions = [],
    ): string {
        $recipientLines = collect((array) ($recipient['lines'] ?? []))
            ->map(fn ($line) => trim((string) $line))
            ->filter()
            ->values()
            ->all();
        $deliveryTargets = collect($deliveryTargets)
            ->map(fn ($value) => trim((string) $value))
            ->filter()
            ->values()
            ->all();

        $nodes = array_values(array_filter($tiptapContent, 'is_array'));
        if (! $salutationEmbeddedInBody && trim($salutation) !== '') {
            array_unshift($nodes, ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => trim($salutation)]]]);
        }

        $template = new DocumentTemplate([
            'name' => 'Brief',
            'title' => $this->metadataTitle($subjectText),
            'subtitle' => null,
            'style' => $this->letterStyle(
                organization: $organization,
                recipientLines: $recipientLines,
                letterDate: $letterDate,
                subjectText: trim($subjectText),
                yourReference: filled($yourReference) ? $yourReference : null,
                ourReference: filled($ourReference) ? $ourReference : null,
                deliveryNote: filled($deliveryNote) ? $deliveryNote : null,
                deliveryTargetLabel: filled($deliveryTargetLabel) ? $deliveryTargetLabel : null,
                deliveryTargets: $deliveryTargets,
            ),
            'blocks' => $nodes,
        ]);

        return $this->renderer->render($template, [
            'organization' => [...$organization, 'name' => trim((string) ($organization['senderName'] ?? ''))],
            'documentFooter' => [
                'reference' => trim('Brief '.($ourReference ?? '')),
                ...$footerOptions,
            ],
        ]);
    }

    public function filename(Letter $letter): string
    {
        $number = preg_replace('/[^A-Za-z0-9_-]+/', '-', $letter->number ?: 'Entwurf') ?: 'Brief';
        return 'Brief-'.$number.'.pdf';
    }

    /** @param array<int, string> $recipientLines @param array<int, string> $deliveryTargets */
    private function letterStyle(
        array $organization,
        array $recipientLines,
        string $letterDate,
        string $subjectText,
        ?string $yourReference,
        ?string $ourReference,
        ?string $deliveryNote,
        ?string $deliveryTargetLabel,
        array $deliveryTargets,
    ): array {
        $shared = $this->layoutPolicy->style([], 'letter');

        return [
            ...$shared,
            // Only page geometry and DIN-5008 chrome are letter-specific. Body
            // typography, headings, rules and tables stay on the report policy.
            'layoutProfile' => 'din5008-letter',
            'marginLeft' => 25.0,
            'marginRight' => 20.0,
            'marginTop' => 20.0,
            // The PDF document expands this minimum using the actual wrapped
            // issuer/footer content before any body pagination takes place.
            'marginBottom' => 17.0,
            'firstPageBodyTop' => 111.0,
            'continuationBodyTop' => 30.0,
            'preserveSourcePageBreaks' => true,
            'letter' => [
                'organization' => $organization,
                'recipientLines' => $recipientLines,
                'letterDate' => $letterDate,
                'subjectText' => $subjectText,
                'yourReference' => $yourReference,
                'ourReference' => $ourReference,
                'deliveryNote' => $deliveryNote,
                'deliveryTargetLabel' => $deliveryTargetLabel,
                'deliveryTargets' => $deliveryTargets,
            ],
        ];
    }

    private function metadataTitle(string $subjectText): string
    {
        $firstLine = trim((string) ((preg_split('/\R/u', trim($subjectText)) ?: [trim($subjectText)])[0] ?? ''));
        return $firstLine !== '' ? $firstLine : 'Brief';
    }

    private function deliveryNote(Letter $letter): ?string
    {
        $channel = match ($letter->delivery_method) {
            'registered' => 'Einschreiben',
            'registered_return_receipt' => 'Einschreiben/Rückschein',
            'drop_in' => 'Einwurf',
            default => null,
        };
        $instruction = match ($letter->delivery_instruction) {
            'personal' => 'Persönlich',
            'confidential' => 'Vertraulich',
            'personal_confidential' => 'Persönlich · Vertraulich',
            default => null,
        };

        $parts = array_values(array_filter([$channel, $instruction]));
        return $parts !== [] ? implode(' · ', $parts) : null;
    }

    private function deliveryTargetLabel(?string $method): ?string
    {
        return match ($method) {
            'email' => 'Zustellung per E-Mail',
            'fax' => 'Zustellung per Fax',
            default => null,
        };
    }
}
