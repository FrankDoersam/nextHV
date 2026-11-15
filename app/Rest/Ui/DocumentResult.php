<?php

namespace App\Rest\Ui;

use InvalidArgumentException;

/** Typed, renderer-independent document contract shared by every report action. */
final readonly class DocumentResult
{
    public function __construct(public string $title, public string $url, public string $name, public string $presentation = 'sheet')
    {
        if (! str_starts_with($url, '/api/') || ! in_array($presentation, ['sheet', 'dialog'], true)) {
            throw new InvalidArgumentException('Reports require a local API URL and a sheet or dialog presentation.');
        }
        if ($name === '' || basename($name) !== $name || str_contains($name, '\\') || preg_match('/[\r\n]/', $name)) {
            throw new InvalidArgumentException('Reports require a plain download filename.');
        }
    }

    /** @return array{ui: array{type: string, title: string, url: string, name: string, mime: string, presentation: string}} */
    public function toArray(): array
    {
        return ['ui' => ['type' => 'document', 'title' => $this->title, 'url' => $this->url, 'name' => $this->name, 'mime' => 'application/pdf', 'presentation' => $this->presentation]];
    }
}
