<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;

abstract class JsonApiActionRequest extends FormRequest
{
    /**
     * JSON:API actions carry command values inside top-level meta.
     * Values are mirrored to the request root for convenient validated access,
     * while validation errors are mapped back to /meta/*.
     *
     * @param array<string, mixed> $rules
     * @return array<string, mixed>
     */
    protected function commandRules(array $rules): array
    {
        return ['meta' => ['required', 'array']] + $rules;
    }

    protected function prepareForValidation(): void
    {
        $meta = $this->input('meta');

        if (is_array($meta)) {
            $this->merge($meta);
        }
    }

    protected function failedValidation(Validator $validator): void
    {
        throw ValidationException::withMessages(
            $this->commandErrorMessages($validator->errors()->messages()),
        );
    }

    public function asCommandValidationException(ValidationException $exception): ValidationException
    {
        return ValidationException::withMessages(
            $this->commandErrorMessages($exception->errors()),
        );
    }

    /**
     * @param array<string, array<int, string>> $errors
     * @return array<string, array<int, string>>
     */
    private function commandErrorMessages(array $errors): array
    {
        if (array_key_exists('meta', $errors)) {
            return ['meta' => $errors['meta']];
        }

        $mapped = [];

        foreach ($errors as $field => $messages) {
            $field = (string) $field;
            $mapped[$field === 'meta' || str_starts_with($field, 'meta.') ? $field : 'meta.'.$field] = $messages;
        }

        return $mapped;
    }
}
