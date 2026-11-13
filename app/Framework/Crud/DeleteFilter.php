<?php

namespace App\Framework\Crud;

use Illuminate\Database\Eloquent\Builder;

/**
 * Declarative, parenthesized Eloquent predicates for delete restrictions.
 * AND is the default; explicit OR is always grouped by the executor.
 */
final class DeleteFilter
{
    private array $clauses = [];

    public static function make(): self
    {
        return new self;
    }

    public function where(string $field, mixed $operatorOrValue, mixed $value = null): self
    {
        $operator = func_num_args() === 2 ? '=' : $operatorOrValue;
        $value = func_num_args() === 2 ? $operatorOrValue : $value;
        $this->clauses[] = ['type' => 'where', 'field' => $field, 'operator' => $operator, 'value' => $value, 'boolean' => 'and'];

        return $this;
    }

    public function orWhere(string $field, mixed $operatorOrValue, mixed $value = null): self
    {
        $operator = func_num_args() === 2 ? '=' : $operatorOrValue;
        $value = func_num_args() === 2 ? $operatorOrValue : $value;
        $this->clauses[] = ['type' => 'where', 'field' => $field, 'operator' => $operator, 'value' => $value, 'boolean' => 'or'];

        return $this;
    }

    public function whereIn(string $field, array $values): self
    {
        $this->clauses[] = ['type' => 'in', 'field' => $field, 'values' => $values, 'boolean' => 'and'];

        return $this;
    }

    public function whereHas(string $relation, self $filter): self
    {
        $this->clauses[] = ['type' => 'has', 'relation' => $relation, 'filter' => $filter, 'boolean' => 'and'];

        return $this;
    }

    public function orWhereHas(string $relation, self $filter): self
    {
        $this->clauses[] = ['type' => 'has', 'relation' => $relation, 'filter' => $filter, 'boolean' => 'or'];

        return $this;
    }

    public function group(self $filter): self
    {
        $this->clauses[] = ['type' => 'group', 'filter' => $filter, 'boolean' => 'and'];

        return $this;
    }

    public function orGroup(self $filter): self
    {
        $this->clauses[] = ['type' => 'group', 'filter' => $filter, 'boolean' => 'or'];

        return $this;
    }

    public function apply(Builder $query): void
    {
        foreach ($this->clauses as $clause) {
            $or = $clause['boolean'] === 'or';

            if ($clause['type'] === 'where') {
                $method = $or ? 'orWhere' : 'where';
                $query->{$method}($clause['field'], $clause['operator'], $clause['value']);
            } elseif ($clause['type'] === 'in') {
                $method = $or ? 'orWhereIn' : 'whereIn';
                $query->{$method}($clause['field'], $clause['values']);
            } elseif ($clause['type'] === 'has') {
                $method = $or ? 'orWhereHas' : 'whereHas';
                $query->{$method}($clause['relation'], fn (Builder $nested) => $clause['filter']->apply($nested));
            } else {
                $method = $or ? 'orWhere' : 'where';
                $query->{$method}(fn (Builder $nested) => $clause['filter']->apply($nested));
            }
        }
    }
}
