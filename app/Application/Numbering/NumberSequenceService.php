<?php

namespace App\Application\Numbering;

use App\Models\NumberSequence;
use App\Models\NumberSequenceCounter;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

final class NumberSequenceService
{
    public function __construct(
        private readonly NumberSequenceRegistry $registry,
        private readonly NumberSequenceFormatter $formatter,
        private readonly AuditLogger $auditLogger,
    ) {}

    /** @return array<string, array<string, mixed>> */
    public function registry(): array
    {
        return $this->registry->all();
    }

    /** @return array<string, mixed> */
    public function registered(string $key): array
    {
        return $this->registry->get($key);
    }

    public function syncDefinitions(): void
    {
        if (! Schema::hasTable('number_sequences')) {
            return;
        }

        foreach ($this->registry->all() as $key => $definition) {
            $managed = [
                'label' => (string) ($definition['label'] ?? $key),
                'description' => $definition['description'] ?? null,
            ];

            $sequence = NumberSequence::query()->firstOrCreate(
                ['key' => $key],
                [
                    ...$managed,
                    'prefix' => (string) ($definition['prefix'] ?? ''),
                    'pattern' => (string) ($definition['pattern'] ?? '{SEQ:6}'),
                    'reset_policy' => (string) ($definition['reset_policy'] ?? 'never'),
                    'start_value' => max(1, (int) ($definition['start_value'] ?? 1)),
                    'increment' => max(1, (int) ($definition['increment'] ?? 1)),
                    'is_active' => true,
                    'lock_version' => 0,
                ],
            );

            if ($sequence->label !== $managed['label'] || $sequence->description !== $managed['description']) {
                $sequence->forceFill($managed)->saveQuietly();
            }
        }
    }

    public function next(
        string $key,
        DateTimeInterface|string|null $date = null,
        array $context = [],
    ): string {
        return DB::transaction(function () use ($key, $date, $context): string {
            $sequence = $this->definition($key, true);
            $this->assertActive($sequence);
            $when = $this->date($date);
            $scopeKey = $this->scopeKey($sequence->reset_policy, $when);

            NumberSequenceCounter::query()->firstOrCreate(
                ['number_sequence_id' => $sequence->id, 'scope_key' => $scopeKey],
                ['last_value' => $this->initialLastValue($sequence)],
            );

            $counter = NumberSequenceCounter::query()
                ->where('number_sequence_id', $sequence->id)
                ->where('scope_key', $scopeKey)
                ->lockForUpdate()
                ->first();

            if (! $counter) {
                throw new RuntimeException("Nummernkreis {$key} konnte nicht initialisiert werden.");
            }

            $value = max(
                (int) $sequence->start_value,
                (int) $counter->last_value + (int) $sequence->increment,
            );
            $resolvedContext = [...$this->registry->sampleContext($key), ...$context];
            [$value, $candidate] = $this->findAvailableValue($sequence, $value, $when, $resolvedContext);

            $counter->forceFill(['last_value' => $value])->save();

            return $candidate;
        }, 3);
    }

    public function assign(Model $model, string $key, bool $replace = false): string
    {
        $field = $this->registry->field($key);
        $current = trim((string) $model->getAttribute($field));

        if (! $replace && $current !== '') {
            return $current;
        }

        $number = $this->next(
            $key,
            $this->registry->dateValueFor($model, $key),
            $this->registry->contextFor($model, $key),
        );
        $model->setAttribute($field, $number);

        return $number;
    }

    public function assignPersisted(Model $model, string $key): Model
    {
        $class = $model::class;
        $id = $model->getKey();

        return DB::transaction(function () use ($class, $id, $key): Model {
            /** @var Model $locked */
            $locked = $class::query()->lockForUpdate()->findOrFail($id);
            $field = $this->registry->field($key);

            if (trim((string) $locked->getAttribute($field)) === '') {
                $this->assign($locked, $key);
                $locked->saveQuietly();
            }

            return $locked->fresh() ?? $locked;
        }, 3);
    }

    /** @return array<string, mixed> */
    public function present(NumberSequence $sequence, DateTimeInterface|string|null $date = null): array
    {
        $when = $this->date($date);
        $candidateValue = $this->peekNextValue($sequence, $when);
        [$nextValue, $preview] = $this->findAvailableValue(
            $sequence,
            $candidateValue,
            $when,
            $this->registry->sampleContext($sequence->key),
        );

        return [
            'key' => $sequence->key,
            'label' => $sequence->label,
            'description' => $sequence->description,
            'prefix' => $sequence->prefix,
            'pattern' => $sequence->pattern,
            'resetPolicy' => $sequence->reset_policy,
            'startValue' => (int) $sequence->start_value,
            'increment' => (int) $sequence->increment,
            'nextValue' => $nextValue,
            'preview' => $preview,
            'isActive' => (bool) $sequence->is_active,
            'contextTokens' => $this->registry->contextTokens($sequence->key),
            'version' => (int) $sequence->lock_version,
            'updatedAt' => $sequence->updated_at?->toISOString(),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public function all(): array
    {
        $this->syncDefinitions();
        $keys = array_keys($this->registry->all());
        $order = array_flip($keys);

        return NumberSequence::query()
            ->whereIn('key', $keys)
            ->get()
            ->sortBy(fn (NumberSequence $sequence): int => $order[$sequence->key] ?? PHP_INT_MAX)
            ->map(fn (NumberSequence $sequence): array => $this->present($sequence))
            ->values()
            ->all();
    }

    /** @return array{preview:string,nextValue:int} */
    public function preview(string $key, array $values): array
    {
        $sequence = clone $this->definition($key);
        $sequence->forceFill([
            'prefix' => trim((string) ($values['prefix'] ?? $sequence->prefix)),
            'pattern' => trim((string) ($values['pattern'] ?? $sequence->pattern)),
            'reset_policy' => (string) ($values['resetPolicy'] ?? $sequence->reset_policy),
            'start_value' => max(1, (int) ($values['startValue'] ?? $sequence->start_value)),
            'increment' => max(1, (int) ($values['increment'] ?? $sequence->increment)),
        ]);

        $this->formatter->validate(
            (string) $sequence->prefix,
            (string) $sequence->pattern,
            (string) $sequence->reset_policy,
            $this->registry->contextTokens($key),
        );

        $when = CarbonImmutable::now((string) config('app.timezone', 'Europe/Berlin'));
        $currentNext = $this->peekNextValue($sequence, $when);
        $requestedNext = array_key_exists('nextValue', $values)
            ? max(1, (int) $values['nextValue'])
            : $currentNext;

        if ($requestedNext < $currentNext) {
            throw ValidationException::withMessages([
                'nextValue' => "Der nächste Wert kann nicht von {$currentNext} auf {$requestedNext} zurückgesetzt werden. Nummernkreise dürfen nur vorwärts gesetzt werden.",
            ]);
        }

        [$nextValue, $preview] = $this->findAvailableValue(
            $sequence,
            $requestedNext,
            $when,
            $this->registry->sampleContext($key),
        );

        return ['preview' => $preview, 'nextValue' => $nextValue];
    }

    /** @return array<string, mixed> */
    public function update(string $key, array $values, ?string $userId = null): array
    {
        return DB::transaction(function () use ($key, $values, $userId): array {
            $sequence = $this->definition($key, true);
            $expectedVersion = array_key_exists('expectedVersion', $values)
                ? (int) $values['expectedVersion']
                : null;

            if ($expectedVersion !== null && $expectedVersion !== (int) $sequence->lock_version) {
                throw ValidationException::withMessages([
                    'expectedVersion' => 'Dieser Nummernkreis wurde zwischenzeitlich geändert. Bitte neu laden und Ihre Änderung auf Basis des aktuellen Stands erneut durchführen.',
                ]);
            }

            $before = $this->snapshot($sequence);
            $prefix = trim((string) ($values['prefix'] ?? $sequence->prefix));
            $pattern = trim((string) ($values['pattern'] ?? $sequence->pattern));
            $resetPolicy = (string) ($values['resetPolicy'] ?? $sequence->reset_policy);
            $startValue = max(1, (int) ($values['startValue'] ?? $sequence->start_value));
            $increment = max(1, (int) ($values['increment'] ?? $sequence->increment));

            $this->formatter->validate(
                $prefix,
                $pattern,
                $resetPolicy,
                $this->registry->contextTokens($key),
            );

            $sequence->forceFill([
                'prefix' => $prefix,
                'pattern' => $pattern,
                'reset_policy' => $resetPolicy,
                'start_value' => $startValue,
                'increment' => $increment,
                'lock_version' => (int) $sequence->lock_version + 1,
                'updated_by' => $userId,
            ])->save();

            $counterChanged = false;
            $counterScope = null;
            $requestedNext = null;

            if (array_key_exists('nextValue', $values)) {
                $requestedNext = max(1, (int) $values['nextValue']);
                $when = CarbonImmutable::now((string) config('app.timezone', 'Europe/Berlin'));
                $currentNext = $this->peekNextValue($sequence, $when);

                if ($requestedNext < $currentNext) {
                    throw ValidationException::withMessages([
                        'nextValue' => "Der nächste Wert kann nicht von {$currentNext} auf {$requestedNext} zurückgesetzt werden. Nummernkreise dürfen nur vorwärts gesetzt werden.",
                    ]);
                }

                if ($requestedNext !== $currentNext) {
                    $this->setNextValue($sequence, $requestedNext, $when);
                    $counterChanged = true;
                    $counterScope = $this->scopeKey($sequence->reset_policy, $when);
                }
            }

            $fresh = $sequence->fresh() ?? $sequence;
            $this->audit($fresh, 'settings_update', $before, $this->snapshot($fresh), $userId);

            if ($counterChanged) {
                $this->audit($fresh, 'counter_advance', null, null, $userId, $counterScope, $requestedNext);
            }

            return $this->present($fresh);
        }, 3);
    }

    public function validatePattern(string $key, string $prefix, string $pattern, string $resetPolicy): void
    {
        $this->formatter->validate(
            $prefix,
            $pattern,
            $resetPolicy,
            $this->registry->contextTokens($key),
        );
    }

    private function definition(string $key, bool $lock = false): NumberSequence
    {
        $this->registry->get($key);
        $this->syncDefinitions();
        $query = NumberSequence::query()->where('key', $key);

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->firstOrFail();
    }

    private function assertActive(NumberSequence $sequence): void
    {
        if (! $sequence->is_active) {
            throw ValidationException::withMessages([
                'numberSequence' => "Der Nummernkreis {$sequence->label} ist deaktiviert.",
            ]);
        }
    }

    private function date(DateTimeInterface|string|null $value): CarbonImmutable
    {
        if ($value instanceof DateTimeInterface) {
            return CarbonImmutable::instance($value);
        }

        if (is_string($value) && trim($value) !== '') {
            try {
                return CarbonImmutable::parse($value);
            } catch (Throwable) {
                throw ValidationException::withMessages([
                    'date' => 'Für die Nummernvergabe wurde ein ungültiges Belegdatum übergeben.',
                ]);
            }
        }

        return CarbonImmutable::now((string) config('app.timezone', 'Europe/Berlin'));
    }

    private function scopeKey(string $policy, CarbonImmutable $date): string
    {
        return match ($policy) {
            'year' => $date->format('Y'),
            'month' => $date->format('Ym'),
            'day' => $date->format('Ymd'),
            default => 'global',
        };
    }

    private function initialLastValue(NumberSequence $sequence): int
    {
        return (int) $sequence->start_value - (int) $sequence->increment;
    }

    private function peekNextValue(NumberSequence $sequence, CarbonImmutable $date): int
    {
        $last = NumberSequenceCounter::query()
            ->where('number_sequence_id', $sequence->id)
            ->where('scope_key', $this->scopeKey($sequence->reset_policy, $date))
            ->value('last_value');

        if ($last === null) {
            return (int) $sequence->start_value;
        }

        return max(
            (int) $sequence->start_value,
            (int) $last + (int) $sequence->increment,
        );
    }

    private function setNextValue(NumberSequence $sequence, int $nextValue, CarbonImmutable $when): void
    {
        $scopeKey = $this->scopeKey($sequence->reset_policy, $when);
        $lastValue = $nextValue - (int) $sequence->increment;

        NumberSequenceCounter::query()->firstOrCreate(
            ['number_sequence_id' => $sequence->id, 'scope_key' => $scopeKey],
            ['last_value' => $lastValue],
        );

        $counter = NumberSequenceCounter::query()
            ->where('number_sequence_id', $sequence->id)
            ->where('scope_key', $scopeKey)
            ->lockForUpdate()
            ->first();

        if (! $counter) {
            throw new RuntimeException("Nummernkreis {$sequence->key} konnte nicht eingestellt werden.");
        }

        $counter->forceFill(['last_value' => $lastValue])->save();
    }

    /** @param array<string, string> $context */
    private function render(NumberSequence $sequence, int $value, CarbonImmutable $date, array $context): string
    {
        return $this->formatter->render(
            (string) $sequence->prefix,
            (string) $sequence->pattern,
            $value,
            $date,
            $context,
            $this->registry->contextTokens($sequence->key),
            $this->registry->maxLength($sequence->key),
        );
    }

    /** @param array<string, string> $context @return array{0:int,1:string} */
    private function findAvailableValue(NumberSequence $sequence, int $startValue, CarbonImmutable $date, array $context): array
    {
        $value = $startValue;

        for ($attempt = 0; $attempt < 10_000; $attempt++) {
            $candidate = $this->render($sequence, $value, $date, $context);
            if ($this->registry->isAvailable($sequence->key, $candidate)) {
                return [$value, $candidate];
            }
            $value += (int) $sequence->increment;
        }

        throw new RuntimeException("Nummernkreis {$sequence->key} konnte nach 10.000 Versuchen keine freie Nummer ermitteln.");
    }

    /** @return array<string, mixed> */
    private function snapshot(NumberSequence $sequence): array
    {
        return [
            'prefix' => (string) $sequence->prefix,
            'pattern' => (string) $sequence->pattern,
            'resetPolicy' => (string) $sequence->reset_policy,
            'startValue' => (int) $sequence->start_value,
            'increment' => (int) $sequence->increment,
            'version' => (int) $sequence->lock_version,
        ];
    }

    /** @param array<string, mixed>|null $before @param array<string, mixed>|null $after */
    private function audit(
        NumberSequence $sequence,
        string $action,
        ?array $before,
        ?array $after,
        ?string $actorId,
        ?string $scopeKey = null,
        ?int $value = null,
    ): void {
        if (! Schema::hasTable('audit_logs')) {
            return;
        }

        $actor = $actorId ? User::query()->find($actorId) : null;

        $this->auditLogger->record(
            request: app()->bound('request') ? request() : null,
            event: 'number_sequence.'.$action,
            category: 'administration',
            severity: in_array($action, ['rebuild', 'repair_missing', 'finance_clear_reset'], true) ? 'high' : 'info',
            outcome: 'success',
            actor: $actor,
            subjectType: 'number_sequence',
            subjectId: (string) $sequence->id,
            resourceType: 'number_sequence',
            resourceId: (string) $sequence->id,
            contextType: $scopeKey ? 'sequence_scope' : null,
            contextId: $scopeKey,
            metadata: [
                'sequence_key' => (string) $sequence->key,
                'action' => $action,
                'value' => $value,
                'before' => $before,
                'after' => $after,
            ],
        );
    }
}
