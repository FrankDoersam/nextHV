<?php

namespace App\Support\Validation;

use Illuminate\Support\Str;
use Illuminate\Validation\Validator;

/** Keeps native validation paths intact while presenting one actionable message per field. */
class LocalizedValidator extends Validator
{
    public function passes(): bool
    {
        foreach ($this->rules as $attribute => $rules) {
            $excluded = [];
            $presence = [];
            $remaining = [];
            foreach ($rules as $rule) {
                $name = is_string($rule) ? Str::before($rule, ':') : null;
                if ($name === 'bail') {
                    continue;
                }
                if ($name !== null && str_starts_with($name, 'exclude')) {
                    $excluded[] = $rule;
                } elseif ($name !== 'required_array_keys' && $name !== null && ($name === 'filled' || str_starts_with($name, 'required') || str_starts_with($name, 'present'))) {
                    $presence[] = $rule;
                } else {
                    $remaining[] = $rule;
                }
            }
            $this->rules[$attribute] = [...$excluded, 'bail', ...$presence, ...$remaining];
        }

        return parent::passes();
    }

    /** @param string $attribute */
    public function getDisplayableAttribute($attribute): string
    {
        $display = parent::getDisplayableAttribute($attribute);
        $fallback = str_replace('_', ' ', Str::snake($attribute));
        if ($display !== $attribute && $display !== $fallback) {
            return $display;
        }

        $leaf = Str::afterLast($attribute, '.');
        $labels = $this->translator->get('validation.attributes');
        $label = is_array($labels) ? ($labels[$leaf] ?? null) : null;
        // New/unrecognized payload keys never leak technical paths into user-facing messages.
        $label ??= $this->translator->get('validation.unknown_attribute');
        $parts = [];
        if (preg_match_all('/(?:^|\.)relations\.([^.]+)\.(\d+)(?=\.|$)/', $attribute, $matches, PREG_SET_ORDER)) {
            $relations = $this->translator->get('validation.relations');
            foreach ($matches as $match) {
                $relation = is_array($relations) ? ($relations[$match[1]] ?? null) : null;
                $parts[] = $this->translator->get('validation.relation_row', ['relation' => $relation ?? $this->translator->get('validation.related_records'), 'row' => (int) $match[2] + 1]);
            }
        }
        $parts[] = $label;

        return implode(' · ', $parts);
    }
}
