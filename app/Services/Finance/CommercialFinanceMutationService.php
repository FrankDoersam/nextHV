<?php

namespace App\Services\Finance;

use App\Models\BusinessPartner;
use App\Models\IncomingInvoice;
use App\Models\IncomingInvoiceItem;
use App\Models\OpenItem;
use App\Models\Property;
use App\Models\PropertyAccount;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CommercialFinanceMutationService
{
    public function validateIncomingInvoice(array $values, ?IncomingInvoice $invoice = null, bool $lockReferences = false): void
    {
        $errors = [];
        $gross = round((float) ($values['grossAmount'] ?? 0), 2);
        $net = round((float) ($values['netAmount'] ?? 0), 2);
        $tax = round((float) ($values['taxAmount'] ?? 0), 2);
        $invoiceDate = trim((string) ($values['invoiceDate'] ?? ''));
        $dueDate = trim((string) ($values['dueDate'] ?? '')) ?: null;
        $serviceFrom = trim((string) ($values['servicePeriodFrom'] ?? '')) ?: null;
        $serviceUntil = trim((string) ($values['servicePeriodUntil'] ?? '')) ?: null;
        $supplierId = trim((string) ($values['supplierId'] ?? '')) ?: null;
        $propertyId = trim((string) ($values['propertyId'] ?? '')) ?: null;
        $externalNumber = trim((string) ($values['externalNumber'] ?? '')) ?: null;
        $items = array_values(array_filter(is_array($values['items'] ?? null) ? $values['items'] : [], 'is_array'));
        $documentType = (string) ($values['documentType'] ?? 'invoice');
        $originalInvoiceId = trim((string) ($values['originalInvoiceId'] ?? '')) ?: null;

        if (! in_array($documentType, IncomingInvoice::DOCUMENT_TYPES, true)) {
            $errors['documentType'][] = 'Unbekannte Belegart.';
        }
        if ($invoice && $documentType !== ($invoice->document_type ?: 'invoice')) {
            $errors['documentType'][] = 'Die Belegart eines vorhandenen Belegs darf nicht geändert werden. Bitte legen Sie einen neuen Beleg an.';
        }
        if ($invoice && in_array($documentType, ['supplier_credit', 'credit'], true)
            && (string) ($invoice->original_invoice_id ?? '') !== (string) ($originalInvoiceId ?? '')) {
            $errors['originalInvoiceId'][] = 'Die Ursprungsrechnung darf nach der Erfassung nicht ausgetauscht werden.';
        }
        if ($documentType === 'invoice' && $originalInvoiceId) {
            $errors['originalInvoiceId'][] = 'Eine Ursprungsrechnung ist nur bei Lieferantengutschriften zulässig.';
        }
        if (in_array($documentType, ['supplier_credit', 'credit'], true)) {
            if (! $originalInvoiceId) {
                $errors['originalInvoiceId'][] = 'Eine Lieferantengutschrift muss auf die ursprüngliche Eingangsrechnung verweisen.';
            } else {
                $originalQuery = IncomingInvoice::query()->whereKey($originalInvoiceId);
                if ($lockReferences) $originalQuery->lockForUpdate();
                $original = $originalQuery->first();
                if (! $original || $original->document_type !== 'invoice' || ($invoice && $original->is($invoice))) {
                    $errors['originalInvoiceId'][] = 'Die Ursprungsrechnung ist nicht verfügbar oder kein regulärer Rechnungsbeleg.';
                } else {
                    if ($original->workflow_status === 'cancelled') {
                        $errors['originalInvoiceId'][] = 'Eine stornierte Ursprungsrechnung kann nicht gutgeschrieben werden.';
                    }
                    if ((string) ($supplierId ?? '') !== (string) ($original->supplier_id ?? '')) {
                        $errors['supplier'][] = 'Lieferant und Ursprungsrechnung müssen übereinstimmen.';
                    }
                    if ((string) ($propertyId ?? '') !== (string) ($original->property_id ?? '')) {
                        $errors['property'][] = 'Das Objekt muss mit der Ursprungsrechnung übereinstimmen.';
                    }
                    if ($this->validDate($invoiceDate) && $invoiceDate < $original->invoice_date?->toDateString()) {
                        $errors['invoiceDate'][] = 'Das Gutschriftsdatum darf nicht vor dem ursprünglichen Rechnungsdatum liegen.';
                    }
                    $existingCredits = IncomingInvoice::query()
                        ->where('original_invoice_id', $original->id)
                        ->whereIn('document_type', ['supplier_credit', 'credit'])
                        ->where('workflow_status', '!=', 'cancelled')
                        ->when($invoice, fn ($query, IncomingInvoice $current) => $query->whereKeyNot($current->id))
                        ->sum('gross_amount');
                    if (($values['workflowStatus'] ?? 'draft') !== 'cancelled'
                        && $gross > round((float) $original->gross_amount - (float) $existingCredits, 2) + 0.001) {
                        $errors['grossAmount'][] = 'Die Summe der Lieferantengutschriften darf den Bruttobetrag der Ursprungsrechnung nicht übersteigen.';
                    }
                }
            }
        }
        if ($invoice && $documentType === 'invoice' && ($invoice->creditNotes()->exists() || $invoice->credits()->exists())) {
            $creditTotal = (float) IncomingInvoice::query()->where('original_invoice_id', $invoice->id)
                ->whereIn('document_type', ['supplier_credit', 'credit'])
                ->where('workflow_status', '!=', 'cancelled')->sum('gross_amount');
            if (($values['workflowStatus'] ?? $invoice->workflow_status) === 'cancelled') {
                $errors['workflowStatus'][] = 'Eine Rechnung mit aktiven Lieferantengutschriften kann nicht storniert werden.';
            }
            if ($gross + 0.001 < $creditTotal) {
                $errors['grossAmount'][] = 'Eine Ursprungsrechnung darf nicht kleiner als die Summe ihrer Lieferantengutschriften werden.';
            }
        }

        if (! $this->validDate($invoiceDate)) {
            $errors['invoiceDate'][] = 'Ein gültiges Rechnungsdatum fehlt.';
        }
        if ($gross <= 0) {
            $errors['grossAmount'][] = 'Der Bruttobetrag muss größer als 0 sein.';
        }
        if (abs(($net + $tax) - $gross) > 0.01) {
            $errors['grossAmount'][] = 'Bruttobetrag muss Netto- plus Steuerbetrag entsprechen.';
        }
        if ($invoiceDate !== '' && $dueDate && $this->validDate($dueDate) && $dueDate < $invoiceDate) {
            $errors['dueDate'][] = 'Die Fälligkeit darf nicht vor dem Rechnungsdatum liegen.';
        }
        if ($serviceFrom && $serviceUntil && $this->validDate($serviceFrom) && $this->validDate($serviceUntil) && $serviceUntil < $serviceFrom) {
            $errors['servicePeriodUntil'][] = 'Das Ende des Leistungszeitraums darf nicht vor dem Beginn liegen.';
        }

        if ($supplierId) {
            $supplierQuery = BusinessPartner::query()->whereKey($supplierId);
            if ($lockReferences) $supplierQuery->lockForUpdate();
            if (! $supplierQuery->first(['id'])) {
                $errors['supplier'][] = 'Der ausgewählte Lieferant existiert nicht oder ist gelöscht.';
            }
        }
        if ($propertyId) {
            $propertyQuery = Property::query()->whereKey($propertyId);
            if ($lockReferences) $propertyQuery->lockForUpdate();
            if (! $propertyQuery->first(['id'])) {
                $errors['property'][] = 'Das ausgewählte Objekt existiert nicht oder ist gelöscht.';
            }
        }

        if ($items !== []) {
            $itemGross = 0.0;
            $itemNetTotal = 0.0;
            $itemTaxTotal = 0.0;
            foreach ($items as $index => $item) {
                $quantity = (float) ($item['quantity'] ?? 1);
                $itemNet = round((float) ($item['netAmount'] ?? 0), 2);
                $itemTax = round((float) ($item['taxAmount'] ?? 0), 2);
                $itemGrossValue = round((float) ($item['grossAmount'] ?? 0), 2);
                $itemGross += $itemGrossValue;
                $itemNetTotal += $itemNet;
                $itemTaxTotal += $itemTax;
                $treatment = (string) ($item['taxTreatment'] ?? 'review');
                $category = trim((string) ($item['taxCategory'] ?? ''));
                if (! in_array($treatment, IncomingInvoiceItem::TAX_TREATMENTS, true)) {
                    $errors["items.{$index}.taxTreatment"][] = 'Unbekannte steuerliche Vorprüfung.';
                }
                // The existing advisor workflow assigns provisional categories before
                // the new relevance review. Never discard those legacy classifications.
                if ($category !== '' && ! in_array($category, IncomingInvoiceItem::TAX_CATEGORIES, true)) {
                    $errors["items.{$index}.taxCategory"][] = 'Unbekannte Ausgabenkategorie.';
                } elseif ($treatment === 'relevant' && ($category === '' || $category === 'unclassified')) {
                    $errors["items.{$index}.taxCategory"][] = 'Bitte eine Ausgabenkategorie für den Steuerberater wählen.';
                }
                if (mb_strlen((string) ($item['taxNote'] ?? '')) > 2000) {
                    $errors["items.{$index}.taxNote"][] = 'Der steuerliche Hinweis darf höchstens 2.000 Zeichen enthalten.';
                }
                if (mb_strlen((string) ($item['taxReviewNote'] ?? '')) > 1000) {
                    $errors["items.{$index}.taxReviewNote"][] = 'Der Beraterhinweis darf höchstens 1.000 Zeichen enthalten.';
                }
                if (mb_strlen((string) ($item['allocationNote'] ?? '')) > 2000) {
                    $errors["items.{$index}.allocationNote"][] = 'Der Umlagehinweis darf höchstens 2.000 Zeichen enthalten.';
                }

                if ($quantity <= 0) {
                    $errors["items.{$index}.quantity"][] = 'Die Positionsmenge muss größer als 0 sein.';
                }
                if ($itemNet < 0 || $itemTax < 0 || $itemGrossValue <= 0) {
                    $errors["items.{$index}.grossAmount"][] = 'Die Positionsbeträge sind ungültig.';
                }
                if (abs(($itemNet + $itemTax) - $itemGrossValue) > 0.01) {
                    $errors["items.{$index}.grossAmount"][] = 'Der Positionsbruttobetrag muss Netto plus Steuer entsprechen.';
                }
            }

            if (abs(round($itemGross, 2) - $gross) > 0.01
                || abs(round($itemNetTotal, 2) - $net) > 0.01
                || abs(round($itemTaxTotal, 2) - $tax) > 0.01) {
                $errors['items'][] = 'Netto, Steuer und Brutto müssen jeweils den Summen der Rechnungspositionen entsprechen.';
            }
        }

        $accountIds = collect($items)
            ->pluck('propertyAccountId')
            ->filter(fn (mixed $id): bool => is_string($id) && trim($id) !== '')
            ->map(fn (string $id): string => trim($id))
            ->unique()
            ->values();

        if ($accountIds->isNotEmpty() && ! $propertyId) {
            $errors['property'][] = 'Für kontierte Positionen muss ein Objekt ausgewählt sein.';
        }

        if ($accountIds->isNotEmpty()) {
            $accountsQuery = PropertyAccount::query()
                ->with('allocationKey:id,code,name')
                ->whereIn('id', $accountIds);
            if ($lockReferences) $accountsQuery->lockForUpdate();
            $accounts = $accountsQuery->get()
                ->keyBy(fn (PropertyAccount $account): string => (string) $account->id);

            foreach ($items as $index => $item) {
                $accountId = trim((string) ($item['propertyAccountId'] ?? ''));
                if ($accountId === '') {
                    continue;
                }

                /** @var PropertyAccount|null $account */
                $account = $accounts->get($accountId);
                if (! $account) {
                    $errors["items.{$index}.propertyAccountId"][] = 'Das Objektkonto existiert nicht oder ist gelöscht.';
                    continue;
                }
                if (! $account->is_active) {
                    $errors["items.{$index}.propertyAccountId"][] = 'Das Objektkonto ist deaktiviert.';
                }
                if (! $propertyId || (string) $account->property_id !== (string) $propertyId) {
                    $errors["items.{$index}.propertyAccountId"][] = 'Das Objektkonto gehört nicht zum ausgewählten Objekt.';
                }
                if (in_array($account->allocationKey?->code, [PropertyAccount::DIRECT_UNIT_KEY, PropertyAccount::DIRECT_CONTRACT_KEY], true)) {
                    $errors["items.{$index}.propertyAccountId"][] = 'Direkte Objektkonten benötigen eine konkrete Einheit oder einen Vertrag. Erfassen Sie diese Rechnung als Direktumlage.';
                }
            }
        }

        if ($supplierId && $externalNumber && $this->validDate($invoiceDate)) {
            $duplicate = IncomingInvoice::withTrashed()
                ->where('supplier_id', $supplierId)
                ->where('external_number', $externalNumber)
                ->whereDate('invoice_date', $invoiceDate)
                ->when($invoice, fn ($query, IncomingInvoice $current) => $query->whereKeyNot($current->id))
                ->exists();
            if ($duplicate) {
                $errors['externalNumber'][] = 'Diese Lieferantenrechnung wurde bereits erfasst.';
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    public function saveIncomingInvoice(array $values, ?IncomingInvoice $invoice): IncomingInvoice
    {
        return DB::transaction(function () use ($values, $invoice): IncomingInvoice {
            $locked = $invoice
                ? IncomingInvoice::query()->with(['items', 'allocations'])->lockForUpdate()->findOrFail($invoice->id)
                : new IncomingInvoice;

            $this->validateIncomingInvoice($values, $locked->exists ? $locked : null, true);

            $newGross = round((float) $values['grossAmount'], 2);
            $items = $values['items'] ?? [];
            $existingItems = $locked->exists ? $locked->items->keyBy(fn (IncomingInvoiceItem $item) => (string) $item->id) : collect();
            $submittedIds = collect($items)->pluck('id')->filter()->map(fn ($id) => (string) $id);
            if ($submittedIds->count() !== $submittedIds->unique()->count()
                || $submittedIds->contains(fn (string $id) => ! $existingItems->has($id))) {
                throw ValidationException::withMessages([
                    'lineItems' => 'Eine Rechnungsposition ist doppelt vorhanden oder gehört nicht zu diesem Beleg.',
                ]);
            }
            $hasBookings = $locked->exists && $locked->allocations->isNotEmpty();
            if ($hasBookings && ($values['workflowStatus'] ?? $locked->workflow_status) === 'cancelled') {
                throw ValidationException::withMessages(['workflowStatus' => 'Ein bereits bebuchter Beleg kann nicht über den Workflowstatus storniert werden.']);
            }
            if ($hasBookings && (count($items) !== $existingItems->count()
                || collect($items)->contains(function (array $item) use ($existingItems): bool {
                    $previous = $existingItems->get((string) ($item['id'] ?? ''));
                    return ! $previous
                        || abs((float) $previous->net_amount - (float) $item['netAmount']) > 0.001
                        || abs((float) $previous->tax_amount - (float) $item['taxAmount']) > 0.001
                        || abs((float) $previous->gross_amount - (float) $item['grossAmount']) > 0.001;
                }))) {
                throw ValidationException::withMessages([
                    'lineItems' => 'Nach Zahlungsbuchungen dürfen Rechnungspositionen nicht nachträglich ersetzt oder in ihren Beträgen verändert werden. Steuerliche Zuordnungen bleiben bearbeitbar.',
                ]);
            }
            if ($hasBookings && abs($newGross - round((float) $locked->gross_amount, 2)) > 0.001) {
                throw ValidationException::withMessages([
                    'grossAmount' => 'Der Bruttobetrag kann nach einer Zahlungsbuchung nicht mehr geändert werden. Storniere die Buchung fachlich über einen Gegenbeleg.',
                ]);
            }

            if (! $locked->exists) {
                $locked->paid_amount = 0;
            }

            $paid = round((float) ($locked->paid_amount ?? 0), 2);
            if ($newGross + 0.001 < $paid) {
                throw ValidationException::withMessages(['grossAmount' => 'Der Bruttobetrag darf nicht unter dem bereits gezahlten Betrag liegen.']);
            }

            $discountPercent = round((float) ($values['discountPercent'] ?? 0), 2);
            $locked->fill([
                'external_number' => $values['externalNumber'] ?? null,
                'document_type' => $values['documentType'] ?? 'invoice',
                'original_invoice_id' => ($values['documentType'] ?? 'invoice') !== 'invoice' ? ($values['originalInvoiceId'] ?? null) : null,
                'supplier_id' => $values['supplierId'] ?? null,
                'property_id' => $values['propertyId'] ?? null,
                'invoice_date' => $values['invoiceDate'],
                'due_date' => $values['dueDate'] ?? null,
                'service_period_from' => $values['servicePeriodFrom'] ?? null,
                'service_period_until' => $values['servicePeriodUntil'] ?? null,
                'net_amount' => round((float) $values['netAmount'], 2),
                'tax_amount' => round((float) $values['taxAmount'], 2),
                'gross_amount' => $newGross,
                'open_amount' => ($values['documentType'] ?? 'invoice') === 'credit'
                    ? 0
                    : round(max(0, $newGross - $paid - ($locked->exists && $locked->document_type === 'invoice'
                        ? (float) $locked->credits()->sum('gross_amount') : 0)), 2),
                'discount_percent' => $discountPercent,
                'discount_until' => $values['discountUntil'] ?? null,
                'discount_amount' => round($newGross * ($discountPercent / 100), 2),
                'workflow_status' => $values['workflowStatus'] ?? 'draft',
                'payment_status' => ($values['documentType'] ?? 'invoice') === 'credit' ? 'paid'
                    : (($newGross - $paid - (($values['documentType'] ?? 'invoice') === 'invoice' && $locked->exists
                        ? (float) $locked->credits()->sum('gross_amount') : 0)) <= 0.001 ? 'paid'
                    : (($paid > 0 || (($values['documentType'] ?? 'invoice') === 'invoice' && $locked->exists && $locked->credits()->exists()))
                        ? 'partial' : 'open')),
                'description' => $values['description'] ?? null,
                'notes' => $values['notes'] ?? null,
            ]);
            $locked->save();

            // Stable position IDs are essential for audit, mixed-purpose exports and future references.
            $keptIds = [];
            foreach ($items as $index => $item) {
                // Keep the original advisor CSV field and the new detailed
                // report note synchronized without exceeding the legacy varchar(1000).
                $note = array_key_exists('taxNote', $item)
                    ? $item['taxNote']
                    : ($item['taxReviewNote'] ?? null);
                $legacyNote = array_key_exists('taxReviewNote', $item)
                    ? $item['taxReviewNote']
                    : ($note === null ? null : mb_substr((string) $note, 0, 1000));
                $attributes = [
                    'property_account_id' => $item['propertyAccountId'] ?? null,
                    'description' => $item['description'],
                    'quantity' => $item['quantity'],
                    'unit' => $item['unit'] ?? null,
                    'net_amount' => $item['netAmount'],
                    'tax_rate' => $item['taxRate'],
                    'tax_amount' => $item['taxAmount'],
                    'gross_amount' => $item['grossAmount'],
                    'is_allocatable' => $item['isAllocatable'] ?? true,
                    'allocation_note' => $item['allocationNote'] ?? null,
                    'tax_treatment' => $item['taxTreatment'] ?? 'review',
                    'tax_category' => $item['taxCategory'] ?? 'unclassified',
                    'tax_note' => $note,
                    'tax_review_note' => $legacyNote,
                    'sort_order' => $index + 1,
                ];
                if (! empty($item['id'])) {
                    $existing = $existingItems->get((string) $item['id']);
                    $existing->update($attributes);
                    $keptIds[] = (string) $existing->id;
                } else {
                    $created = $locked->items()->create($attributes);
                    $keptIds[] = (string) $created->id;
                }
            }
            $locked->items()->whereNotIn('id', $keptIds)->delete();
            if ($locked->document_type === 'credit') {
                $this->refreshOriginalCreditBalance((string) $locked->original_invoice_id);
            }

            return $locked->fresh(['supplier', 'property', 'items.propertyAccount', 'allocations']);
        }, 3);
    }

    public function deleteOpenItem(OpenItem $openItem): void
    {
        DB::transaction(function () use ($openItem): void {
            // Payment allocation writes lock the same receivable row first.
            // Holding this lock across the model-level dependency checks closes
            // the race between "no allocation exists" and the soft delete.
            $locked = OpenItem::query()
                ->lockForUpdate()
                ->findOrFail($openItem->id);

            $locked->delete();
        }, 3);
    }

    public function deleteIncomingInvoice(IncomingInvoice $invoice): void
    {
        DB::transaction(function () use ($invoice): void {
            $locked = IncomingInvoice::query()->withCount('allocations')->lockForUpdate()->findOrFail($invoice->id);
            if ($locked->allocations_count > 0 || $locked->creditNotes()->exists() || $locked->credits()->exists()) {
                throw ValidationException::withMessages([
                    'invoice' => 'Der Beleg kann nicht gelöscht werden, weil Zahlungsbuchungen oder Lieferantengutschriften darauf verweisen.',
                ]);
            }
            $originalId = $locked->document_type === 'credit' ? $locked->original_invoice_id : null;
            $locked->delete();
            if ($originalId) $this->refreshOriginalCreditBalance((string) $originalId);
        }, 3);
    }

    private function refreshOriginalCreditBalance(string $originalId): void
    {
        $original = IncomingInvoice::query()->lockForUpdate()->findOrFail($originalId);
        $credits = round((float) $original->credits()->sum('gross_amount'), 2);
        $remaining = round(max(0, (float) $original->gross_amount - $credits - (float) $original->paid_amount), 2);
        $original->update([
            'open_amount' => $remaining,
            'payment_status' => $remaining <= 0.001 ? 'paid' : ((float) $original->paid_amount > 0 || $credits > 0 ? 'partial' : 'open'),
        ]);
    }

    private function validDate(string $value): bool
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }

        [$year, $month, $day] = array_map('intval', explode('-', $value));
        return checkdate($month, $day, $year);
    }
}
