<?php

namespace App\Framework\Crud;

use Closure;

final class CrudRules
{
    private array $defaults = [];

    private array $forced = [];

    private array $createOnly = [];

    private array $deleteRestrictions = [];

    private array $deleteRecordFilters = [];

    private array $deleteConditions = [];

    private array $cloneOverrides = [];

    private array $cloneUniqueFields = [];

    private array $cloneRelations = [];

    private array $protectedConditions = [];

    public static function make(): self
    {
        return new self;
    }

    public function default(string $attribute, mixed $value): self
    {
        $this->defaults[$attribute] = $value;

        return $this;
    }

    public function force(string $attribute, mixed $value): self
    {
        $this->forced[$attribute] = $value;

        return $this;
    }

    public function createOnly(string ...$attributes): self
    {
        $this->createOnly = array_values(array_unique([...$this->createOnly, ...$attributes]));

        return $this;
    }

    public function restrictDelete(string $relation, string $message, bool $withTrashed = false, string $field = 'resource', ?DeleteFilter $filter = null): self
    {
        $this->deleteRestrictions[] = compact('relation', 'message', 'withTrashed', 'field', 'filter');

        return $this;
    }

    public function restrictDeleteOnRecord(DeleteFilter $filter, string $message, string $field = 'resource'): self
    {
        $this->deleteRecordFilters[] = compact('filter', 'message', 'field');

        return $this;
    }

    public function cloneUnique(array $fields): self
    {
        $this->cloneUniqueFields = $fields;

        return $this;
    }

    public function cloneUniqueFields(): array
    {
        return $this->cloneUniqueFields;
    }

    public function cloneOverride(string $attribute, mixed $value): self
    {
        $this->cloneOverrides[$attribute] = $value;

        return $this;
    }

    public function cloneRelation(string $name, array $overrides = [], bool $default = false, ?Closure $filter = null): self
    {
        $this->cloneRelations[$name] = compact('overrides', 'default', 'filter');

        return $this;
    }

    public function cloneOverrides(): array
    {
        return $this->cloneOverrides;
    }

    public function cloneRelations(): array
    {
        return $this->cloneRelations;
    }

    public function deleteRecordFilters(): array
    {
        return $this->deleteRecordFilters;
    }

    public function preventDeleteWhen(Closure $predicate, string $message, string $field = 'resource'): self
    {
        $this->deleteConditions[] = compact('predicate', 'message', 'field');

        return $this;
    }

    public function protectWhen(Closure $predicate, array $attributes, string $message, string $field = 'resource'): self
    {
        $this->protectedConditions[] = compact('predicate', 'attributes', 'message', 'field');

        return $this;
    }

    public function defaults(): array
    {
        return $this->defaults;
    }

    public function forcedValues(): array
    {
        return $this->forced;
    }

    public function createOnlyFields(): array
    {
        return $this->createOnly;
    }

    public function deleteRestrictions(): array
    {
        return $this->deleteRestrictions;
    }

    public function deleteConditions(): array
    {
        return $this->deleteConditions;
    }

    public function protectedConditions(): array
    {
        return $this->protectedConditions;
    }

    public function metadata(): array
    {
        return [
            'defaults' => $this->defaults,
            'forced' => array_keys($this->forced),
            'createOnly' => $this->createOnly,
            'deleteRestrictions' => array_column($this->deleteRestrictions, 'relation'),
            'cloneRelations' => array_keys($this->cloneRelations),
        ];
    }
}
