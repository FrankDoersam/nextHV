<?php

namespace App\Reports\Support;

use App\Services\Documents\Concerns\OrganizationProfilePdfLayout;
use FPDF;

class OrganizationPdfDocument extends FPDF
{
    use OrganizationProfilePdfLayout;

    private array $profileFooter = [];

    /** @param array<string, mixed> $organization */
    public function __construct(
        private readonly array $organization,
        private readonly string $documentTitle,
    ) {
        parent::__construct('P', 'mm', 'A4');
        $this->SetMargins(18, 24, 18);
        $this->AliasNbPages();
        $this->configureFooter();
    }

    /** Configure after margins and before the first page so every page has the same reserved area. */
    public function configureFooter(float $firstPageBodyTop = 24.0, array $options = []): void
    {
        if ($this->PageNo() > 0) {
            throw new \LogicException('Der Dokumentfuß muss vor der ersten PDF-Seite festgelegt werden.');
        }

        $this->profileFooter = $this->measureOrganizationProfileFooter(
            $this->organization,
            $firstPageBodyTop,
            [],
            ['reference' => $this->documentTitle, ...$options],
        );
        $this->SetAutoPageBreak(true, $this->minimumBottomMargin());
    }

    public function bodyBottom(): float
    {
        return (float) $this->profileFooter['bodyBottom'];
    }

    public function minimumBottomMargin(float $requested = 0.0): float
    {
        return max($requested, $this->GetPageHeight() - $this->bodyBottom());
    }

    public function Header(): void
    {
        $sender = trim((string) ($this->organization['senderName'] ?? '')) ?: (string) config('app.name', 'Verwaltung');
        $representedBy = trim((string) ($this->organization['representedBy'] ?? ''));
        $address = $this->addressLine();

        $this->SetFont('Arial', 'B', 12);
        $this->Cell(112, 6, $this->encodeText($sender), 0, 0);
        $this->SetFont('Arial', 'B', 9);
        $this->Cell(62, 6, $this->encodeText($this->documentTitle), 0, 1, 'R');

        $this->SetFont('Arial', '', 8);
        if ($representedBy !== '') {
            $this->Cell(112, 4.5, $this->encodeText('Vertreten durch '.$representedBy), 0, 0);
        } else {
            $this->Cell(112, 4.5, '', 0, 0);
        }
        $this->Cell(62, 4.5, $this->encodeText($address), 0, 1, 'R');

        $this->SetDrawColor(190, 198, 208);
        $this->Line(18, $this->GetY() + 2, 192, $this->GetY() + 2);
        $this->Ln(7);
    }

    public function Footer(): void
    {
        $this->renderOrganizationProfileFooter($this->profileFooter, '{nb}');
    }

    public function encodeText(string $value): string
    {
        return iconv('UTF-8', 'windows-1252//TRANSLIT', $value) ?: $value;
    }

    public function encode(string $value): string
    {
        return $this->encodeText($value);
    }

    private function addressLine(): string
    {
        $street = trim((string) ($this->organization['street'] ?? '').' '.(string) ($this->organization['houseNumber'] ?? ''));
        $city = trim((string) ($this->organization['postalCode'] ?? '').' '.(string) ($this->organization['city'] ?? ''));

        return implode(', ', array_values(array_filter([$street, $city], fn (string $value): bool => $value !== '')));
    }
}
