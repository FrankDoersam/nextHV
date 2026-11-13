<?php

namespace App\Rest\Metrics;

use App\Domain\Property\Actions\CalculateOverview;
use Illuminate\Database\Eloquent\Builder;
use Lomkit\Rest\Metrics\Metric;
use Lomkit\Rest\Metrics\MetricResult;

class PropertyOverview extends Metric
{
    public ?string $uriKey = 'overview';

    public function type(): string
    {
        return 'overview';
    }

    public function calculate(Builder $query): MetricResult
    {
        return new OverviewResult(app(CalculateOverview::class)->handle($query));
    }
}
