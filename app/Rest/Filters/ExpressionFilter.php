<?php

namespace App\Rest\Filters;

use Closure;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Database\Query\Expression;
use Lomkit\Rest\Contracts\Filter;
use Lomkit\Rest\Fields\Filtering\FilterOperator;

/** Expressions come exclusively from resource declarations; values stay bound parameters. */
final class ExpressionFilter implements Filter
{
    /** @param Closure(Builder): string $expression */
    public function __construct(private readonly Closure $expression) {}

    public function apply(Builder $query, string $operator, mixed $value): void
    {
        FilterOperator::parse($operator)->condition()->apply($query, new Expression(($this->expression)($query)), $value, 'and');
    }

    public static function column(Builder $query, string $name): string
    {
        return $query->getQuery()->getGrammar()->wrap($query->qualifyColumn($name));
    }

    /** @param list<string> $expressions Trusted SQL expressions, never request values. */
    public static function concat(Builder $query, array $expressions): string
    {
        return in_array($query->getConnection()->getDriverName(), ['mysql', 'mariadb', 'sqlsrv'], true)
            ? 'CONCAT('.implode(', ', $expressions).')'
            : '('.implode(' || ', $expressions).')';
    }
}
