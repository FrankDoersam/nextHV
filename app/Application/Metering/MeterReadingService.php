<?php

namespace App\Application\Metering;

use App\Application\Metering\Rules\MeterReadingDate;
use App\Application\Metering\Rules\MeterReadingReferenceDate;
use App\Application\Metering\Rules\MeterReadingValueSequence;
use App\Application\S4ExecutionContext;
use App\Models\Document;
use App\Models\Meter;
use App\Models\MeterReading;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class MeterReadingService
{
    public const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

    public function inspectCreate(array $input, S4ExecutionContext $context, bool $requireEvidence = false): array
    {
        return $this->inspect($input, $context, null, true, $requireEvidence, array_key_exists('documentId', $input));
    }

    public function inspect(
        array $input,
        S4ExecutionContext $context,
        ?MeterReading $reading,
        bool $creating,
        bool $requireEvidence = false,
        bool $documentSubmitted = true,
    ): array {
        $normalized = $this->normalize($input, $context, $reading);
        $meter = $normalized['meterId'] !== '' ? Meter::query()->find($normalized['meterId']) : null;
        $readingDate = (string) ($normalized['readingDate'] ?? '');
        $referenceDate = (string) ($normalized['referenceDate'] ?? '');
        $readingType = (string) ($normalized['readingType'] ?? '');
        $source = (string) ($normalized['source'] ?? '');

        $notesRules = in_array($readingType, ['correction', 'replacement'], true)
            ? ['required', 'string', 'min:5', 'max:5000']
            : ['nullable', 'string', 'max:5000'];
        $readerRules = ['required', 'string', 'min:2', 'max:120', 'not_regex:/^\s*$/u'];
        if (in_array($source, ['external', 'imported'], true)) {
            $readerRules[] = 'not_regex:/^(unbekannt|extern|fremdablesung|dienstleister|import|importiert)$/iu';
        }

        $rules = [
            'meterId' => ['required', 'uuid', Rule::exists('meters', 'id')->whereNull('deleted_at')],
            'referenceDate' => [
                'bail', 'required', 'date', 'before_or_equal:'.$context->today(),
                ...($readingDate !== '' ? ['before_or_equal:'.$readingDate] : []),
                new MeterReadingReferenceDate($meter, $reading, $creating),
            ],
            'readingDate' => [
                'bail', 'required', 'date',
                ...($referenceDate !== '' ? ['after_or_equal:'.$referenceDate] : []),
                'before_or_equal:'.$context->today(), new MeterReadingDate($meter),
            ],
            'value' => [
                'bail', 'required', 'numeric', 'min:0', 'max:9999999999999.999',
                new MeterReadingValueSequence($meter, $reading, $referenceDate !== '' ? $referenceDate : null),
            ],
            'readingType' => ['required', Rule::in(MeterReading::TYPES)],
            'source' => ['required', Rule::in(MeterReading::SOURCES)],
            'readerName' => $readerRules,
            'notes' => $notesRules,
            'documentId' => [
                'nullable', 'uuid',
                function (string $attribute, mixed $value, \Closure $fail) use ($meter, $reading, $creating, $requireEvidence, $documentSubmitted): void {
                    $documentId = is_string($value) && $value !== '' ? $value : null;
                    if (! $documentId) {
                        if ($requireEvidence) {
                            $fail('Für diese Ablesung ist ein Fotonachweis erforderlich.');
                        } elseif (! $creating && $documentSubmitted && $reading?->document_id) {
                            $fail('Der Fotonachweis kann nicht entfernt werden. Hinterlegen Sie bei Bedarf ein neues Foto.');
                        }
                        return;
                    }

                    $document = Document::query()->find($documentId);
                    if (! $document) {
                        $fail('Der ausgewählte Nachweis ist nicht mehr verfügbar.');
                        return;
                    }
                    if (! $meter || $document->documentable_type !== $meter->getMorphClass() || (string) $document->documentable_id !== (string) $meter->id) {
                        $fail('Der Nachweis muss zur Zählerakte dieser Ablesung gehören.');
                        return;
                    }
                    $alreadyAssigned = MeterReading::withTrashed()
                        ->where('document_id', $documentId)
                        ->when($reading, fn ($query) => $query->whereKeyNot($reading->getKey()))
                        ->exists();
                    if ($alreadyAssigned) {
                        $fail('Dieser Fotonachweis ist bereits einer anderen Ablesung zugeordnet.');
                        return;
                    }
                    if (! str_starts_with((string) $document->mime_type, 'image/')) {
                        $fail('Als Ablesungsnachweis ist eine Bilddatei erforderlich.');
                        return;
                    }
                    if ((int) $document->size_bytes > self::MAX_EVIDENCE_BYTES) {
                        $fail('Der Ablesungsnachweis darf höchstens 10 MB groß sein.');
                    }
                },
            ],
        ];

        $messages = [
            'referenceDate.before_or_equal' => 'Der Stichtag darf nicht nach dem Ablesedatum oder in der Zukunft liegen.',
            'readingDate.after_or_equal' => 'Das Ablesedatum darf nicht vor dem Stichtag liegen.',
            'readingDate.before_or_equal' => 'Das Ablesedatum darf nicht in der Zukunft liegen.',
            'value.min' => 'Der Zählerstand darf nicht negativ sein.',
            'readerName.required' => 'Bitte geben Sie an, wer die Ablesung durchgeführt oder geliefert hat.',
            'readerName.min' => 'Die Angabe „Abgelesen durch“ muss mindestens zwei Zeichen enthalten.',
            'readerName.not_regex' => $source === 'imported'
                ? 'Bei einer importierten Ablesung muss die konkrete Importquelle angegeben werden.'
                : 'Bei einer Fremdablesung muss die konkrete Person oder Organisation angegeben werden.',
            'notes.required' => $readingType === 'replacement'
                ? 'Bei einem Zählerwechsel muss der Wechsel im Hinweis nachvollziehbar dokumentiert werden.'
                : 'Bei einer Korrektur muss der Grund im Hinweis dokumentiert werden.',
            'notes.min' => $readingType === 'replacement'
                ? 'Bei einem Zählerwechsel muss der Wechsel im Hinweis nachvollziehbar dokumentiert werden.'
                : 'Bei einer Korrektur muss der Grund im Hinweis dokumentiert werden.',
            'notes.max' => 'Der interne Hinweis darf höchstens 5.000 Zeichen lang sein.',
        ];
        $attributes = [
            'meterId' => 'Zähler', 'referenceDate' => 'Stichtag', 'readingDate' => 'Abgelesen am',
            'value' => 'Zählerstand', 'readingType' => 'Anlass', 'source' => 'Quelle',
            'readerName' => 'Abgelesen durch', 'notes' => 'Interner Hinweis', 'documentId' => 'Fotonachweis',
        ];
        $validator = Validator::make($normalized, $rules, $messages, $attributes);

        return ['normalized' => $normalized, 'errors' => $validator->fails() ? $validator->errors()->toArray() : []];
    }

    public function create(array $input, S4ExecutionContext $context, bool $requireEvidence = false): MeterReading
    {
        $inspection = $this->inspectCreate($input, $context, $requireEvidence);
        if ($inspection['errors'] !== []) throw ValidationException::withMessages($inspection['errors']);
        $data = $inspection['normalized'];

        return DB::transaction(function () use ($data): MeterReading {
            $reading = MeterReading::query()->create([
                'meter_id' => $data['meterId'], 'document_id' => $data['documentId'],
                'reference_date' => $data['referenceDate'], 'reading_date' => $data['readingDate'],
                'value' => $data['value'], 'reading_type' => $data['readingType'], 'source' => $data['source'],
                'reader_name' => $data['readerName'], 'reader_user_id' => $data['readerUserId'],
                'recorded_by_user_id' => $data['recordedByUserId'], 'notes' => $data['notes'],
            ]);
            return $reading->fresh(['meter.property', 'meter.unit', 'document', 'readerUser', 'recordedByUser']);
        }, 3);
    }

    public function validateForJsonApi(array $input, S4ExecutionContext $context, ?MeterReading $reading, bool $creating, bool $documentSubmitted): array
    {
        return $this->inspect($input, $context, $reading, $creating, false, $documentSubmitted);
    }

    private function normalize(array $input, S4ExecutionContext $context, ?MeterReading $reading): array
    {
        $creating = $reading === null;
        $source = array_key_exists('source', $input) ? trim((string) $input['source']) : ($reading?->source ?: 'manual');
        $readerWasSupplied = array_key_exists('readerName', $input);
        $readerName = $readerWasSupplied ? trim((string) $input['readerName']) : ($reading?->reader_name ?: trim((string) $context->actor->name));
        $readerUserId = $reading?->reader_user_id;
        if ($creating && ! $readerWasSupplied && $source === 'manual') $readerUserId = (string) $context->actor->id;

        $documentId = array_key_exists('documentId', $input) ? ($input['documentId'] ?: null) : $reading?->document_id;
        $referenceDate = array_key_exists('referenceDate', $input) ? $input['referenceDate'] : ($reading?->reference_date?->toDateString() ?? $context->today());
        $readingDate = array_key_exists('readingDate', $input) ? $input['readingDate'] : ($reading?->reading_date?->toDateString() ?? $context->today());
        $value = array_key_exists('value', $input) ? $input['value'] : $reading?->value;
        $readingType = array_key_exists('readingType', $input) ? $input['readingType'] : ($reading?->reading_type ?? 'interim_reading');
        $notesValue = array_key_exists('notes', $input) ? $input['notes'] : $reading?->notes;
        $notes = $notesValue === null ? null : trim((string) $notesValue);

        return [
            'meterId' => $reading ? (string) $reading->meter_id : trim((string) ($input['meterId'] ?? data_get($input, 'meter.id', ''))),
            'documentId' => $documentId ? (string) $documentId : null,
            'referenceDate' => trim((string) $referenceDate),
            'readingDate' => trim((string) $readingDate),
            'value' => $value,
            'readingType' => trim((string) $readingType),
            'source' => $source,
            'readerName' => $readerName,
            'readerUserId' => $readerUserId ? (string) $readerUserId : null,
            'recordedByUserId' => $reading?->recorded_by_user_id ? (string) $reading->recorded_by_user_id : (string) $context->actor->id,
            'notes' => $notes === '' ? null : $notes,
        ];
    }
}
