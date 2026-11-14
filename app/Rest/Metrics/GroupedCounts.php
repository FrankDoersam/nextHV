<?php

namespace App\Rest\Metrics;

use App\Rest\Metrics\OverviewResult;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;
use Lomkit\Rest\Metrics\Metric;
use Lomkit\Rest\Metrics\MetricResult;

/**
 * Count groups on the already-authorized, filtered Lomkit query.
 * Never use a client-supplied column in SQL unless explicitly whitelisted.
 */
final class GroupedCounts extends Metric
{
    public ?string $uriKey = 'groups';

    /** @param list<string> $allowedFields Direct, persisted model columns only. */
    public function __construct(private readonly array $allowedFields) {}

    public function type(): string
    {
        return 'summary';
    }

    public function calculate(Builder $query): MetricResult
    {
        $field = request()->input('group');
        if (! is_string($field) || ! in_array($field, $this->allowedFields, true)) {
            throw ValidationException::withMessages([
                'group' => 'Dieses Gruppierungsfeld ist nicht zugelassen.',
            ]);
        }

        $qualified = $query->qualifyColumn($field);
        $grammar = $query->getQuery()->getGrammar();
        $column = $grammar->wrap($qualified);
        $grouped = (clone $query)->reorder()
            ->selectRaw($column.' as grouping_value, COUNT(*) as row_count')
            ->groupBy($qualified)
            ->orderBy($qualified)
            ->limit(201)
            ->get();

        if ($grouped->count() > 200) {
            throw ValidationException::withMessages([
                'group' => 'Zu viele Gruppen. Bitte die Auswahl zuerst eingrenzen.',
            ]);
        }

        return new OverviewResult([
            'field' => $field,
            'total' => $grouped->sum(fn ($row) => (int) $row->row_count),
            'groups' => $grouped->map(fn ($row) => [
                'value' => $row->getRawOriginal('grouping_value'),
                'count' => (int) $row->row_count,
            ])->values()->all(),
        ]);
    }
}
