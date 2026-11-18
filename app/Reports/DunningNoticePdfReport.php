<?php

namespace App\Reports;

use App\Models\DunningNotice;
use App\Services\Documents\OrganizationDocumentProfile;
use App\Services\OperatingCosts\OperatingCostPaymentQrCode;

final class DunningNoticePdfReport
{
    public function __construct(private readonly LetterPdfReport $letters) {}

    public function render(DunningNotice $notice): string
    {
        $notice->loadMissing(['items', 'feeReceivable']);

        $organization = $this->organization((array) ($notice->organization_snapshot ?? []));
        $recipient = $this->recipient((array) ($notice->recipient_snapshot ?? []));
        $context = (array) ($notice->context_snapshot ?? []);
        $payment = (array) ($notice->payment_snapshot ?? []);

        return $this->letters->renderSnapshot(
            organization: $organization,
            recipient: $recipient,
            letterDate: $notice->issued_on?->format('d.m.Y') ?? '',
            subjectText: $this->subject($notice, $context),
            salutation: trim((string) ($recipient['salutation'] ?? 'Sehr geehrte Damen und Herren,')),
            tiptapContent: $this->tiptapContent($notice, $payment, $organization),
            yourReference: null,
            ourReference: $notice->number,
            deliveryNote: null,
            footerOptions: [
                'reference' => implode(' · ', array_filter([
                    trim($this->levelLabel($notice->level).' '.$notice->number),
                    filled($context['contractNumber'] ?? null) ? 'Vertrag '.$context['contractNumber'] : '',
                ])),
                'payment' => [...$payment, 'purpose' => 'payment'],
            ],
        );
    }

    public function filename(DunningNotice $notice): string
    {
        $number = preg_replace('/[^A-Za-z0-9_-]+/', '-', $notice->number) ?: $notice->id;

        return $this->levelLabel($notice->level).'-'.$number.'.pdf';
    }

    public function levelLabel(string $level): string
    {
        return match ($level) {
            'reminder' => 'Zahlungserinnerung',
            'dunning_1' => '1. Mahnung',
            'dunning_2' => '2. Mahnung',
            default => 'Mahnschreiben',
        };
    }

    /** @param array<string, mixed> $snapshot */
    private function organization(array $snapshot): array
    {
        // Normalize only the document's saved snapshot. Do not read current settings
        // here: reprinting an issued notice must preserve its issuer identity.
        return app(OrganizationDocumentProfile::class)->normalize($snapshot);
    }

    /** @param array<string, mixed> $snapshot */
    private function recipient(array $snapshot): array
    {
        $lines = (array) ($snapshot['lines'] ?? []);
        if ($lines === []) {
            $lines = [
                ...(array) ($snapshot['names'] ?? []),
                ...(array) ($snapshot['addressLines'] ?? []),
            ];
        }

        $snapshot['lines'] = collect($lines)
            ->map(fn ($line) => trim((string) $line))
            ->filter()
            ->values()
            ->all();

        return $snapshot;
    }

    /** @param array<string, mixed> $context */
    private function subject(DunningNotice $notice, array $context): string
    {
        $contractNumber = trim((string) ($context['contractNumber'] ?? ''));

        return $contractNumber !== ''
            ? $this->levelLabel($notice->level).' · Vertrag '.$contractNumber
            : $this->levelLabel($notice->level);
    }

    /**
     * Dunning notices provide semantic letter content only. Header, address window,
     * references, subject spacing, continuation pages and footer stay owned by the
     * exact same central DIN-5008 pipeline as regular letters.
     *
     * @param array<string, mixed> $payment
     * @return array<int, array<string, mixed>>
     */
    private function tiptapContent(DunningNotice $notice, array $payment, array $organization): array
    {
        $context = (array) ($notice->context_snapshot ?? []);
        $introText = trim((string) ($context['dunningIntroText'] ?? $context['dunningText'] ?? ''));
        $closingText = trim((string) ($context['dunningClosingText'] ?? ''));
        $nodes = $this->bodyTextNodes($introText !== '' ? $introText : $this->intro($notice->level));
        $nodes[] = $this->heading('Offene Posten');
        $nodes[] = $this->claimsTable($notice);
        $nodes[] = $this->paragraph([
            $this->text('Bitte zahlen Sie den Gesamtbetrag von '),
            $this->text($this->money((float) $notice->total_due), bold: true),
            $this->text(' bis spätestens zum '),
            $this->text($notice->payment_due_on?->format('d.m.Y') ?? 'angegebenen Fälligkeitstermin', bold: true),
            $this->text('. Geben Sie dabei als Referenz '),
            $this->text((string) $notice->number, bold: true),
            $this->text(' an.'),
        ]);

        // A complete captured account lives in the common footer. Preserve
        // the legacy body fallback when an old snapshot lacks its holder.
        $footer = app(OrganizationDocumentProfile::class)->footerContent($organization, [
            'payment' => [...$payment, 'purpose' => 'payment'],
        ]);
        $bankLines = $footer['payment']['lines'] !== [] ? [] : array_values(array_filter([
            ! empty($payment['iban']) ? 'IBAN '.trim((string) $payment['iban']) : null,
            ! empty($payment['bic']) ? 'BIC '.trim((string) $payment['bic']) : null,
            ! empty($payment['bankName']) ? trim((string) $payment['bankName']) : null,
        ]));

        if ($bankLines !== []) {
            $nodes[] = $this->heading('Bankverbindung');
            $nodes[] = $this->lineParagraph($bankLines);
        }

        $senderName = trim((string) ($organization['senderName'] ?? ''));
        $closing = $closingText !== '' ? $closingText : $this->closing($notice->level);
        $qrPng = ($context['paymentQrCodeEnabled'] ?? false) === true && (float) $notice->total_due > 0.004
            ? (new OperatingCostPaymentQrCode())->png($payment, (float) $notice->total_due, (string) $notice->number)
            : null;

        if ($qrPng !== null) {
            // Preserve the three semantic parts so spacing does not depend on
            // blank lines in the text and the QR caption can sit close to the code.
            $nodes[] = [
                'type' => 'paymentQrBlock',
                'attrs' => [
                    'closingText' => $closing,
                    'signoff' => 'Mit freundlichen Grüßen',
                    'senderName' => $senderName,
                    'png' => base64_encode($qrPng),
                ],
            ];
        } else {
            // Non-QR letters retain their existing full-width text layout.
            $nodes[] = $this->paragraph('');
            $nodes = [...$nodes, ...$this->bodyTextNodes($closing)];
            $nodes[] = $this->paragraph('Mit freundlichen Grüßen');
            if ($senderName !== '') {
                $nodes[] = $this->paragraph('');
                $nodes[] = $this->paragraph($senderName);
            }
        }

        return $nodes;
    }

    /** @return array<int,array<string,mixed>> */
    private function bodyTextNodes(string $value): array
    {
        $blocks = preg_split('/\R{2,}/u', trim($value)) ?: [];

        return collect($blocks)
            ->map(fn (string $block): array => $this->lineParagraph(
                array_values(array_filter(preg_split('/\R/u', trim($block)) ?: [], static fn (string $line): bool => $line !== ''))
            ))
            ->values()
            ->all();
    }

    private function claimsTable(DunningNotice $notice): array
    {
        $rows = [];

        foreach ($notice->items as $item) {
            $description = trim((string) $item->description);
            $reference = trim((string) $item->receivable_number);
            $dueDate = $item->due_date?->format('d.m.Y');
            $subtitle = implode(' · ', array_values(array_filter([
                $reference !== '' ? 'Forderung '.$reference : null,
                $dueDate !== null ? 'Fällig am '.$dueDate : null,
            ])));

            $rows[] = [
                'title' => $description !== '' ? $description : ($reference !== '' ? 'Forderung '.$reference : 'Offene Forderung'),
                'subtitle' => $subtitle,
                'amount' => $this->money((float) $item->open_amount),
            ];
        }

        // State the fee explicitly even when no fee is charged. The zero
        // amount is part of the financial breakdown, not an omitted position.
        $feeAmount = (float) $notice->fee_amount;
        $feeReference = trim((string) $notice->fee_receivable_number);
        $rows[] = [
            'kind' => 'fee',
            'muted' => $feeAmount < 0.005,
            'title' => 'Mahngebühren',
            'subtitle' => $feeAmount < 0.005
                ? 'Keine Gebühren berechnet'
                : implode(' · ', array_values(array_filter([
                    $feeReference !== '' ? 'Forderung '.$feeReference : null,
                    $notice->payment_due_on !== null ? 'Fällig am '.$notice->payment_due_on->format('d.m.Y') : null,
                ]))),
            'amount' => $this->money($feeAmount),
        ];

        return [
            'type' => 'invoicePositionTable',
            'attrs' => [
                'headerLabel' => 'Position',
                'amountLabel' => 'Betrag',
                'totalLabel' => 'Gesamtbetrag',
                'totalAmount' => $this->money((float) $notice->total_due),
                'gapAfter' => 3.5,
                'rows' => $rows,
            ],
        ];
    }

    private function heading(string $value): array
    {
        return [
            'type' => 'heading',
            'attrs' => ['level' => 3],
            'content' => [$this->text($value, bold: true)],
        ];
    }

    /** @param string|array<int, array<string, mixed>> $content */
    private function paragraph(string|array $content, ?string $alignment = null): array
    {
        $node = [
            'type' => 'paragraph',
            'content' => is_string($content) ? [$this->text($content)] : $content,
        ];

        if ($alignment !== null) {
            $node['attrs'] = ['textAlign' => $alignment];
        }

        return $node;
    }

    /** @param array<int, string> $lines */
    private function lineParagraph(array $lines): array
    {
        $content = [];
        foreach ($lines as $index => $line) {
            if ($index > 0) {
                $content[] = ['type' => 'hardBreak'];
            }
            $content[] = $this->text($line);
        }

        return $this->paragraph($content);
    }

    private function text(string $value, bool $bold = false): array
    {
        $node = ['type' => 'text', 'text' => $value];
        if ($bold) {
            $node['marks'] = [['type' => 'bold']];
        }

        return $node;
    }

    private function intro(string $level): string
    {
        return match ($level) {
            'reminder' => 'bei der Prüfung unseres Forderungskontos haben wir festgestellt, dass die nachfolgend aufgeführten Beträge noch offen sind. Wir bitten um Prüfung und Ausgleich innerhalb der genannten Zahlungsfrist.',
            'dunning_1' => 'die nachfolgend aufgeführten fälligen Beträge sind weiterhin offen. Wir bitten Sie, den Gesamtbetrag innerhalb der genannten Zahlungsfrist auszugleichen.',
            'dunning_2' => 'trotz des bisherigen Mahnverlaufs sind die nachfolgend aufgeführten fälligen Beträge weiterhin offen. Wir fordern Sie auf, den Gesamtbetrag innerhalb der genannten Zahlungsfrist auszugleichen.',
            default => 'die nachfolgend aufgeführten fälligen Beträge sind noch offen.',
        };
    }

    private function closing(string $level): string
    {
        return match ($level) {
            'reminder' => 'Sollte sich Ihre Zahlung mit dieser Erinnerung überschnitten haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
            'dunning_1' => 'Sollte sich Ihre Zahlung mit dieser Mahnung überschnitten haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
            'dunning_2' => 'Sollte bis zum genannten Termin kein Zahlungseingang vorliegen, prüfen wir die weiteren Schritte. Bereits veranlasste Zahlungen werden selbstverständlich berücksichtigt.',
            default => 'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
        };
    }

    private function money(float $value): string
    {
        return number_format($value, 2, ',', '.').' €';
    }
}
