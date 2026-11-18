<?php

namespace App\Reports;

use App\Models\Contract;
use App\Models\ContractKeyTransfer;
use App\Reports\Support\OrganizationPdfDocument;
use App\Services\Documents\OrganizationDocumentProfile;
use Illuminate\Support\Collection;

class ContractKeyTransferPdfReport
{
    private const RETURN_NOTE = 'Mit den Unterschriften werden die oben aufgeführten Schlüsselbewegungen bestätigt. Bei Teilrückgaben ist für jede weitere Rückgabe ein aktualisierter Nachweis zu erzeugen oder die Rückgabe handschriftlich eindeutig zu ergänzen.';

    public function render(Contract $contract, ContractKeyTransfer $transfer): string
    {
        $issue = $transfer->direction === 'returned' ? $transfer->sourceIssue : $transfer;
        abort_unless($issue && (string) $issue->contract_id === (string) $contract->id, 404);

        $issue->loadMissing([
            'contract.mainUnit.property',
            'party.businessPartner',
            'unitKey',
            'returns.party.businessPartner',
        ]);
        $returns = $issue->returns->sortBy([['transfer_date', 'asc'], ['created_at', 'asc']])->values();
        $organization = app(OrganizationDocumentProfile::class)->current();

        $pdf = new OrganizationPdfDocument($organization, 'Schlüsselnachweis');
        $closingHeight = $this->returnClosingHeight($pdf);
        $shortReturnSection = $returns->count() <= 3;
        $returnSectionHeight = 5.0 + 8.5 + 7.0 + ($returns->isEmpty() ? 8.0 : 7.0 * $returns->count());
        $pdf->configureFooter(43.0, [
            'reference' => 'Schlüsselnachweis · Vertrag '.$contract->contract_number,
            'minimumBodyHeight' => ($shortReturnSection ? $returnSectionHeight : 14.0) + $closingHeight,
        ]);
        $pdf->AddPage();

        $pdf->SetFont('Arial', 'B', 17);
        $pdf->Cell(0, 9, $pdf->encodeText('Schlüsselausgabe und Rückgabe'), 0, 1);
        $pdf->SetFont('Arial', '', 9);
        $pdf->Cell(0, 5, $pdf->encodeText('Vertrag '.$contract->contract_number.' · Nachweis-ID '.$issue->id), 0, 1);
        $pdf->Ln(5);

        $this->section($pdf, 'Vertrag, Objekt und Person');
        $unit = $contract->effectiveMainUnit();
        $property = $unit?->property;
        $this->line($pdf, 'Objekt', trim((string) ($property?->property_number ?? '').' · '.(string) ($property?->name ?? '')));
        $this->line($pdf, 'Anschrift', (string) ($property?->full_address ?? ''));
        $this->line($pdf, 'Einheit', trim((string) ($unit?->unit_number ?? '').' · '.(string) ($unit?->name ?? '')));
        $this->line($pdf, 'Vertrag', (string) $contract->contract_number);
        $this->line($pdf, 'Empfangende Person', (string) ($issue->party?->businessPartner?->display_name ?? 'Nicht zugeordnet'));
        $pdf->Ln(4);

        $this->section($pdf, 'Ausgabe');
        $this->line($pdf, 'Schlüssel', trim((string) ($issue->unitKey?->label ?? '').' · '.$this->keyType((string) ($issue->unitKey?->key_type ?? 'other'))));
        $this->line($pdf, 'Ausgabedatum', $this->date($issue->transfer_date?->toDateString()));
        $this->line($pdf, 'Anzahl', (string) $issue->quantity);
        $this->line($pdf, 'Übergabeart', $issue->is_temporary ? 'Temporäre Ausgabe' : 'Dauerhafte Ausgabe');
        $this->line($pdf, 'Geplante Rückgabe bis', $issue->is_temporary ? $this->date($issue->due_back_on?->toDateString()) : 'Nicht vorgesehen');
        if ($issue->notes) {
            $this->line($pdf, 'Hinweis', (string) $issue->notes);
        }
        $pdf->Ln(3);
        $this->signaturePair($pdf, 'Ausgehändigt durch', 'Empfangen von');

        // Keep a short return section intact. A long table can flow normally;
        // only its last row stays with the status, signatures and closing note.
        $firstReturnBlock = $shortReturnSection ? $returnSectionHeight + $closingHeight : 27.5;
        if ($pdf->GetY() + $firstReturnBlock > $pdf->bodyBottom()) $pdf->AddPage();
        $pdf->Ln(5);
        $this->section($pdf, 'Dokumentierte Rückgabe');
        $this->returnTable($pdf, $returns, $closingHeight);

        $returned = (int) $returns->sum('quantity');
        $open = max(0, (int) $issue->quantity - $returned);
        $pdf->Ln(3);
        $this->line($pdf, 'Zurückgegeben', $returned.' von '.$issue->quantity.' Schlüssel(n)');
        $this->line($pdf, 'Noch offen', $open.' Schlüssel');
        $this->line($pdf, 'Nachweisstatus', $open === 0 ? 'Vollständig zurückgegeben' : ($issue->is_temporary ? 'Temporäre Ausgabe noch offen' : 'Ausgabe noch offen'));
        $pdf->Ln(3);
        $this->signaturePair($pdf, 'Zurückgegeben von', 'Entgegengenommen von');

        $pdf->Ln(4);
        $pdf->SetFont('Arial', '', 8);
        $pdf->MultiCell(0, 4.5, $pdf->encodeText(self::RETURN_NOTE));

        return $pdf->Output('S');
    }

    public function filename(Contract $contract, ContractKeyTransfer $transfer): string
    {
        $transfer->loadMissing(['unitKey', 'sourceIssue.unitKey']);
        $issue = $transfer->direction === 'returned' ? $transfer->sourceIssue : $transfer;
        $number = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string) $contract->contract_number);
        $key = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string) ($issue?->unitKey?->label ?? 'Schluessel'));

        return "Schluesselnachweis-{$number}-{$key}.pdf";
    }

    private function section(OrganizationPdfDocument $pdf, string $title): void
    {
        $pdf->SetFillColor(239, 244, 250);
        $pdf->SetFont('Arial', 'B', 10.5);
        $pdf->Cell(0, 7, $pdf->encodeText($title), 0, 1, 'L', true);
        $pdf->Ln(1.5);
    }

    private function line(OrganizationPdfDocument $pdf, string $label, string $value): void
    {
        $pdf->SetFont('Arial', 'B', 9);
        $pdf->Cell(43, 6, $pdf->encodeText($label), 0);
        $pdf->SetFont('Arial', '', 9);
        $pdf->MultiCell(0, 6, $pdf->encodeText(trim($value) !== '' ? $value : '—'));
    }

    /** @param Collection<int, ContractKeyTransfer> $returns */
    private function returnTable(OrganizationPdfDocument $pdf, Collection $returns, float $closingHeight): void
    {
        $this->returnTableHeader($pdf);

        if ($returns->isEmpty()) {
            $pdf->Cell(174, 8, $pdf->encodeText('Noch keine Rückgabe dokumentiert.'), 1, 1);
            return;
        }

        foreach ($returns as $index => $return) {
            $requiredHeight = 7.0 + ($index === $returns->count() - 1 ? $closingHeight : 0.0);
            if ($pdf->GetY() + $requiredHeight > $pdf->bodyBottom()) {
                $pdf->AddPage();
                $this->returnTableHeader($pdf);
            }
            $pdf->Cell(28, 7, $pdf->encodeText($this->date($return->transfer_date?->toDateString())), 1);
            $pdf->Cell(22, 7, (string) $return->quantity, 1, 0, 'R');
            $pdf->Cell(58, 7, $pdf->encodeText((string) ($return->party?->businessPartner?->display_name ?? 'Nicht zugeordnet')), 1);
            $pdf->Cell(66, 7, $pdf->encodeText(mb_strimwidth((string) ($return->notes ?? '—'), 0, 52, '…')), 1, 1);
        }
    }

    private function returnClosingHeight(OrganizationPdfDocument $pdf): float
    {
        $pdf->SetFont('Arial', '', 8);
        $line = '';
        $lines = 1;
        foreach (explode(' ', $pdf->encodeText(self::RETURN_NOTE)) as $word) {
            $candidate = $line === '' ? $word : $line.' '.$word;
            // The existing 174 mm text block has 1 mm inner margins.
            if ($line !== '' && $pdf->GetStringWidth($candidate) > 172.0) {
                $lines++;
                $line = $word;
            } else {
                $line = $candidate;
            }
        }

        // Status: 3 + 3×6 mm; signature: 3 + 19 mm; note: 4 mm + measured lines.
        return 47.0 + 4.5 * $lines + 0.5;
    }

    private function returnTableHeader(OrganizationPdfDocument $pdf): void
    {
        if ($pdf->GetY() + 15.0 > $pdf->bodyBottom()) $pdf->AddPage();
        $pdf->SetFont('Arial', 'B', 8.5);
        $pdf->Cell(28, 7, $pdf->encodeText('Datum'), 1);
        $pdf->Cell(22, 7, $pdf->encodeText('Anzahl'), 1, 0, 'R');
        $pdf->Cell(58, 7, $pdf->encodeText('Person'), 1);
        $pdf->Cell(66, 7, $pdf->encodeText('Hinweis'), 1, 1);
        $pdf->SetFont('Arial', '', 8);

    }

    private function signaturePair(OrganizationPdfDocument $pdf, string $leftLabel, string $rightLabel): void
    {
        if ($pdf->GetY() + 19.0 > $pdf->bodyBottom()) $pdf->AddPage();
        $y = $pdf->GetY() + 13;
        $pdf->Line(18, $y, 94, $y);
        $pdf->Line(116, $y, 192, $y);
        $pdf->SetY($y + 1.5);
        $pdf->SetFont('Arial', '', 7.5);
        $pdf->Cell(76, 4.5, $pdf->encodeText('Ort, Datum · '.$leftLabel), 0, 0);
        $pdf->Cell(22, 4.5, '', 0, 0);
        $pdf->Cell(76, 4.5, $pdf->encodeText('Ort, Datum · '.$rightLabel), 0, 1);
    }

    private function date(?string $value): string
    {
        return $value ? date('d.m.Y', strtotime($value)) : '—';
    }

    private function keyType(string $value): string
    {
        return match ($value) {
            'system' => 'Systemschlüssel',
            'mailbox' => 'Briefkastenschlüssel',
            'room' => 'Zimmerschlüssel',
            'entrance' => 'Hauseingangsschlüssel',
            'cellar' => 'Kellerschlüssel',
            default => 'Sonstiger Schlüssel',
        };
    }
}
