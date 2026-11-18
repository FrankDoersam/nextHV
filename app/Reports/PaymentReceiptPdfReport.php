<?php

namespace App\Reports;

use App\Models\Payment;
use App\Reports\Support\OrganizationPdfDocument;
use App\Services\Documents\OrganizationDocumentProfile;
use Illuminate\Support\Str;

class PaymentReceiptPdfReport
{
    public function filename(Payment $payment): string
    {
        $number = $payment->receipt_number ?: $payment->number ?: Str::limit($payment->id, 8, '');

        return Str::slug('quittung-'.$number).'.pdf';
    }

    public function render(Payment $payment): string
    {
        $payment->loadMissing([
            'bankAccount.businessPartner',
            'allocations.receivable.contract.parties.businessPartner',
            'allocations.receivable.contract.mainUnit.property',
            'allocations.incomingInvoice.supplier',
            'allocations.incomingInvoice.property',
        ]);

        $receiptNumber = $payment->receipt_number ?: $payment->number ?: $payment->id;
        $organization = app(OrganizationDocumentProfile::class)->current();
        $pdf = new class($organization, 'Quittung · '.$receiptNumber) extends OrganizationPdfDocument {
            public function Header(): void {}
        };

        $pdf->SetTitle($this->text('Quittung '.$receiptNumber));
        $pdf->SetAuthor($this->text(config('app.name', 's4v2')));
        $pdf->SetMargins(18, 18, 18);
        $pdf->configureFooter(18.0, ['minimumBodyHeight' => 90.0]);
        $pdf->SetAutoPageBreak(true, $pdf->minimumBottomMargin(26.0));
        $pdf->AddPage();

        $direction = $payment->direction === 'debit' ? 'Auszahlung' : 'Einzahlung';
        $partyLabel = $payment->direction === 'debit' ? 'Empfänger' : 'Zahlender';
        $amount = $this->money((float) $payment->amount);
        $bookingDate = $payment->booking_date?->format('d.m.Y') ?? '—';
        $valueDate = $payment->value_date?->format('d.m.Y');
        $counterparty = $payment->counterparty_name ?: '—';
        $bankAccount = $payment->bankAccount;
        $bankAccountLabel = trim(collect([$bankAccount?->bank_name, $bankAccount?->iban])->filter()->join(' · '));
        $bankAccountOwner = $bankAccount?->account_holder ?: $bankAccount?->businessPartner?->display_name;

        $this->eyebrow($pdf, 'Barzahlung · '.$direction);
        $pdf->SetTextColor(15, 23, 42);
        $pdf->SetFont('Arial', 'B', 24);
        $pdf->Cell(0, 10, $this->text('Quittung'), 0, 1);
        $pdf->SetFont('Arial', '', 10);
        $pdf->SetTextColor(100, 116, 139);
        $pdf->Cell(0, 6, $this->text('Beleg '.$receiptNumber), 0, 1);

        $pdf->Ln(10);
        $this->amountBox($pdf, $amount);

        $this->section($pdf, 'Zahlungsdaten');
        $this->row($pdf, 'Zahlungsdatum', $bookingDate);
        if ($valueDate && $valueDate !== $bookingDate) {
            $this->row($pdf, 'Valuta', $valueDate);
        }
        $this->row($pdf, 'Zahlungsrichtung', $direction);
        $this->row($pdf, 'Zahlungsweg', 'Barzahlung');
        $this->row($pdf, 'Betrag', $amount, true);

        $this->section($pdf, 'Beteiligte');
        $this->row($pdf, $partyLabel, $counterparty);
        if ($bankAccountLabel !== '') {
            $this->row($pdf, 'Bankkonto', $bankAccountLabel);
        }
        if ($bankAccountOwner && mb_strtolower(trim($bankAccountOwner)) !== mb_strtolower(trim($counterparty))) {
            $this->row($pdf, 'Kontoinhaber', $bankAccountOwner);
        }

        $this->section($pdf, 'Verwendungszweck');
        $this->paragraph($pdf, $payment->purpose ?: '—');

        if ($payment->allocations->isNotEmpty()) {
            $this->section($pdf, 'Zuordnungen');
            foreach ($payment->allocations->sortBy('booked_at') as $allocation) {
                $label = $allocation->target_label;
                $context = $allocation->target_context;
                $type = $allocation->allocation_type === 'overpayment' ? 'Überzahlung' : 'Zuweisung';
                $this->allocationRow($pdf, $type, $label, $context, (float) $allocation->amount);
            }
        }

        if ($payment->notes) {
            $this->section($pdf, 'Notiz');
            $this->paragraph($pdf, $payment->notes);
        }

        $this->signatureFooter($pdf, $payment->direction === 'debit' ? 'Zahlung ausgezahlt' : 'Zahlung erhalten');

        return $pdf->Output('S');
    }

    private function eyebrow(OrganizationPdfDocument $pdf, string $value): void
    {
        $pdf->SetFont('Arial', 'B', 9);
        $pdf->SetTextColor(37, 99, 235);
        $pdf->Cell(0, 5, $this->text(mb_strtoupper($value)), 0, 1);
    }

    private function amountBox(OrganizationPdfDocument $pdf, string $amount): void
    {
        $x = $pdf->GetX();
        $y = $pdf->GetY();
        $pdf->SetFillColor(248, 250, 252);
        $pdf->SetDrawColor(226, 232, 240);
        $pdf->Rect($x, $y, 174, 28, 'DF');
        $pdf->SetXY($x + 6, $y + 5);
        $pdf->SetFont('Arial', '', 9);
        $pdf->SetTextColor(100, 116, 139);
        $pdf->Cell(0, 5, $this->text('Quittungsbetrag'), 0, 1);
        $pdf->SetX($x + 6);
        $pdf->SetFont('Arial', 'B', 22);
        $pdf->SetTextColor(15, 23, 42);
        $pdf->Cell(0, 12, $this->text($amount), 0, 1);
        $pdf->SetY($y + 36);
    }

    private function section(OrganizationPdfDocument $pdf, string $title): void
    {
        $this->ensureSpace($pdf, 21.0);
        $pdf->Ln(4);
        $pdf->SetFont('Arial', 'B', 12);
        $pdf->SetTextColor(15, 23, 42);
        $pdf->Cell(0, 8, $this->text($title), 0, 1);
        $pdf->SetDrawColor(226, 232, 240);
        $pdf->Line(18, $pdf->GetY(), 192, $pdf->GetY());
        $pdf->Ln(2);
    }

    private function row(OrganizationPdfDocument $pdf, string $label, string $value, bool $strong = false): void
    {
        $this->ensureSpace($pdf, 6.0);
        $pdf->SetFont('Arial', '', 10);
        $pdf->SetTextColor(100, 116, 139);
        $pdf->Cell(52, 7, $this->text($label), 0, 0);
        $pdf->SetFont('Arial', $strong ? 'B' : '', 10);
        $pdf->SetTextColor(15, 23, 42);
        $pdf->Cell(0, 7, $this->text($value ?: '—'), 0, 1);
    }

    private function allocationRow(OrganizationPdfDocument $pdf, string $type, string $label, string $context, float $amount): void
    {
        $this->ensureSpace($pdf, 15);
        $pdf->SetFont('Arial', 'B', 8.5);
        $pdf->SetTextColor(15, 23, 42);
        $pdf->Cell(22, 5.5, $this->text($type), 0, 0);
        $pdf->Cell(119, 5.5, $this->text(mb_strimwidth($label, 0, 68, '…', 'UTF-8')), 0, 0);
        $pdf->Cell(33, 5.5, $this->text($this->money($amount)), 0, 1, 'R');
        if (trim($context) !== '') {
            $pdf->SetX(40);
            $pdf->SetFont('Arial', '', 7.5);
            $pdf->SetTextColor(100, 116, 139);
            $pdf->MultiCell(152, 4.2, $this->text($context));
        }
        $pdf->SetDrawColor(235, 238, 242);
        $pdf->Line(40, $pdf->GetY() + 1, 192, $pdf->GetY() + 1);
        $pdf->Ln(2);
    }

    private function paragraph(OrganizationPdfDocument $pdf, string $value): void
    {
        $pdf->SetFont('Arial', '', 10);
        $pdf->SetTextColor(15, 23, 42);
        $pdf->MultiCell(0, 6, $this->text($value ?: '—'));
    }

    private function signatureFooter(OrganizationPdfDocument $pdf, string $leftLabel): void
    {
        $lastSignatureY = min(242.0, $pdf->bodyBottom() - 8.0);
        $preferredY = min(224.0, $lastSignatureY);
        $y = max($pdf->GetY() + 18.0, $preferredY);
        if ($y > $lastSignatureY) {
            $pdf->AddPage();
            $y = max($pdf->GetY() + 18.0, $preferredY);
        }

        $pdf->SetY($y);
        $pdf->SetDrawColor(15, 23, 42);
        $pdf->Line(18, $y, 84, $y);
        $pdf->Line(126, $y, 192, $y);
        $pdf->Ln(2);
        $pdf->SetFont('Arial', '', 9);
        $pdf->SetTextColor(100, 116, 139);
        $pdf->Cell(66, 6, $this->text($leftLabel), 0, 0);
        $pdf->Cell(42, 6, '', 0, 0);
        $pdf->Cell(66, 6, $this->text('Unterschrift'), 0, 1);
    }

    private function ensureSpace(OrganizationPdfDocument $pdf, float $height): void
    {
        if ($pdf->GetY() + $height > min(245.0, $pdf->bodyBottom())) $pdf->AddPage();
    }

    private function money(float $value): string
    {
        return number_format($value, 2, ',', '.').' €';
    }

    private function text(string $value): string
    {
        return iconv('UTF-8', 'windows-1252//TRANSLIT', $value) ?: $value;
    }
}
