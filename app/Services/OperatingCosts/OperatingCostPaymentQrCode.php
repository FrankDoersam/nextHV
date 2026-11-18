<?php

namespace App\Services\OperatingCosts;

use App\Support\QrCode\QRCode;

final class OperatingCostPaymentQrCode
{
    /** @param array<string, mixed> $account */
    public function payload(array $account, float $balance, string $reference): ?string
    {
        // QR code payment instructions must never silently change the amount
        // or identify a different account than the frozen document.
        $cents = (int) round($balance * 100);
        if ($cents < 1 || $cents > 99_999_999_999) {
            return null;
        }

        $holder = $this->oneLine((string) ($account['accountHolder'] ?? ''));
        $iban = strtoupper((string) preg_replace('/\s+/', '', (string) ($account['iban'] ?? '')));
        $bic = strtoupper((string) preg_replace('/\s+/', '', (string) ($account['bic'] ?? '')));
        $reference = $this->oneLine($reference);
        if ($holder === '' || mb_strlen($holder) > 70 || ! $this->validIban($iban)
            || $reference === '' || mb_strlen($reference) > 140
            || ($bic !== '' && preg_match('/\A[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\z/D', $bic) !== 1)) {
            return null;
        }

        // EPC069-12 v3.1 allows a missing BIC only for EEA accounts.
        if ($bic === '' && ! in_array(substr($iban, 0, 2), [
            'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
            'FR', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU',
            'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
        ], true)) {
            return null;
        }

        // EPC: UTF-8; SEPA transfer; optional purpose and structured reference
        // are empty so that the exact statement reference is the free text.
        $payload = rtrim(implode("\n", [
            'BCD', '002', '1', 'SCT', $bic, $holder, $iban,
            'EUR'.number_format($cents / 100, 2, '.', ''),
            '', '', $reference,
        ]), "\n");

        return strlen($payload) <= 331 ? $payload : null;
    }

    /** @param array<string, mixed> $account */
    public function png(array $account, float $balance, string $reference): ?string
    {
        $payload = $this->payload($account, $balance, $reference);
        if ($payload === null) {
            return null;
        }

        // MIT-licensed, locally bundled QR encoder. Error correction M and
        // four-module quiet zone follow the EPC specification. The encoder
        // already reserves four modules per side; wq=1 retains their actual
        // width instead of multiplying it to sixteen. At 8 px/module the
        // embedded PNG remains sharp at the compact print size.
        $image = (new QRCode($payload, ['s' => 'qrm', 'wq' => 1, 'sf' => 8]))->render_image();
        ob_start();
        try {
            if (! imagepng($image)) {
                return null;
            }

            return (string) ob_get_contents();
        } finally {
            ob_end_clean();
            imagedestroy($image);
        }
    }

    private function oneLine(string $value): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $value));
    }

    private function validIban(string $iban): bool
    {
        if (preg_match('/\A[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\z/D', $iban) !== 1) {
            return false;
        }

        // ISO 13616 MOD-97, without converting the whole IBAN into an integer.
        $remainder = 0;
        foreach (str_split(substr($iban, 4).substr($iban, 0, 4)) as $char) {
            $digits = ctype_alpha($char) ? (string) (ord($char) - 55) : $char;
            foreach (str_split($digits) as $digit) {
                $remainder = ($remainder * 10 + (int) $digit) % 97;
            }
        }

        return $remainder === 1;
    }
}
