<?php

namespace App\Rest\Text;

use App\Rest\Resources\Resource;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Lomkit\Rest\Fields\SortDirection;
use Lomkit\Rest\Text\Contains;
use Lomkit\Rest\Text\QueryTextSearch;
use Lomkit\Rest\Text\TextCapabilities;
use Lomkit\Rest\Text\TextMode;
use Lomkit\Rest\Text\TextQuery;
use Lomkit\Rest\Text\TextTarget;

/** Extends native contains search with bounded, declared relation lookups; never joins rows. */
final readonly class RelatedContains implements QueryTextSearch
{
    public function __construct(private Resource $resource) {}

    /** @return array<string, TextTarget> */
    private function targets(): array
    {
        $targets = [];
        foreach ($this->resource->searchableRelations() as $path => $resource) {
            $target = TextTarget::of($resource);
            if (count($target->fields) > 0) {
                $targets[$path] = $target;
            }
        }

        return $targets;
    }

    public function capabilities(TextTarget $target): TextCapabilities
    {
        $names = $target->fields->names();
        foreach ($this->targets() as $path => $related) {
            foreach ($related->names() as $name) {
                $names[] = $path.'.'.$name;
            }
        }
        if ($names === []) {
            return Contains::make()->capabilities($target);
        }

        return new TextCapabilities($names, [TextMode::Words, TextMode::Phrase], false, $target->softDeletes());
    }

    public function apply(Builder $query, TextQuery $text, TextTarget $target): void
    {
        $contains = Contains::make();
        $targets = $this->targets();
        $needles = $text->mode === TextMode::Phrase ? [$text->phrase()] : array_slice($text->words(), 0, Contains::MAX_WORDS);
        foreach ($needles as $needle) {
            $term = new TextQuery($needle, TextMode::Phrase);
            $query->where(function (Builder $group) use ($contains, $targets, $term, $target): void {
                if (count($target->fields) > 0) {
                    $contains->apply($group, $term, $target);
                }
                foreach ($targets as $path => $related) {
                    $group->orWhereHas($path, fn (Builder $relation) => $contains->apply($relation, $term, $related));
                }
            });
        }
    }

    public function orderByRelevance(Builder $query, TextQuery $text, TextTarget $target, SortDirection $direction): void
    {
        Contains::make()->orderByRelevance($query, $text, $target, $direction);
    }

    public function run(Closure $query, TextTarget $target): mixed
    {
        return $query();
    }
}
