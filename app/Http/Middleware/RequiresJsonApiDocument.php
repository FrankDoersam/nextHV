<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RequiresJsonApiDocument
{
    private const MEDIA_TYPE = 'application/vnd.api+json';
    private const BODY_METHODS = ['POST', 'PUT', 'PATCH'];

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->acceptsJsonApi((string) $request->header('Accept', '*/*'))) {
            return $this->error(406, 'Not Acceptable', 'Diese Schnittstelle liefert ausschließlich JSON:API-Dokumente.');
        }

        if (in_array(strtoupper($request->method()), self::BODY_METHODS, true)
            && ! $this->hasJsonApiContentType((string) $request->header('Content-Type', ''))) {
            return $this->error(415, 'Unsupported Media Type', 'Diese Aktion erwartet ein JSON:API-Dokument mit Content-Type application/vnd.api+json.');
        }

        return $next($request);
    }

    private function acceptsJsonApi(string $header): bool
    {
        foreach (explode(',', $header === '' ? '*/*' : $header) as $candidate) {
            $parts = array_values(array_filter(array_map('trim', explode(';', $candidate)), static fn (string $part): bool => $part !== ''));
            $mediaType = strtolower((string) array_shift($parts));
            $parameters = $this->parameters($parts);
            $quality = isset($parameters['q']) && is_numeric($parameters['q']) ? (float) $parameters['q'] : 1.0;
            if ($quality <= 0) {
                continue;
            }

            if (in_array($mediaType, ['*/*', 'application/*'], true)) {
                return true;
            }
            if ($mediaType !== self::MEDIA_TYPE) {
                continue;
            }

            // JSON:API 1.1 allows profile parameters. This API advertises no
            // extensions, therefore an ext parameter is not an acceptable match.
            $unsupported = array_diff(array_keys($parameters), ['q', 'profile']);
            if ($unsupported === []) {
                return true;
            }
        }

        return false;
    }

    private function hasJsonApiContentType(string $header): bool
    {
        $parts = array_values(array_filter(array_map('trim', explode(';', $header)), static fn (string $part): bool => $part !== ''));
        $mediaType = strtolower((string) array_shift($parts));
        if ($mediaType !== self::MEDIA_TYPE) {
            return false;
        }

        // Profiles do not alter JSON:API semantics and may safely be ignored.
        // Unsupported extensions and generic parameters such as charset are
        // rejected instead of being silently accepted.
        return array_diff(array_keys($this->parameters($parts)), ['profile']) === [];
    }

    /** @param array<int, string> $parts @return array<string, string> */
    private function parameters(array $parts): array
    {
        $parameters = [];
        foreach ($parts as $part) {
            [$name, $value] = array_pad(explode('=', $part, 2), 2, '');
            $name = strtolower(trim($name));
            if ($name !== '') {
                $parameters[$name] = trim(trim($value), "\"'");
            }
        }

        return $parameters;
    }

    private function error(int $status, string $title, string $detail): JsonResponse
    {
        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'errors' => [[
                'status' => (string) $status,
                'title' => $title,
                'detail' => $detail,
            ]],
        ], $status, [
            'Content-Type' => self::MEDIA_TYPE,
            'Cache-Control' => 'private, no-store, max-age=0',
            'Vary' => 'Accept',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
