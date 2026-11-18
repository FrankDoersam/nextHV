<?php

namespace App\Services\Audit;

use App\Models\AuditLog;
use App\Models\User;
use App\Services\Auth\SecurityFingerprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Throwable;

final class AuditLogger
{
    private const SENSITIVE_METADATA_KEYS = [
        'password',
        'passwordconfirmation',
        'currentpassword',
        'token',
        'accesstoken',
        'refreshtoken',
        'authorization',
        'cookie',
        'setcookie',
        'secret',
        'clientsecret',
        'apikey',
        'credential',
        'credentials',
    ];

    public function __construct(private readonly SecurityFingerprint $fingerprint)
    {
    }

    public function loginFailed(
        Request $request,
        string $identifier,
        ?User $attemptedUser,
        string $reason,
        int $failureCount,
        int $retryAfter,
    ): void {
        $this->record(
            request: $request,
            event: 'auth.login.failed',
            category: 'authentication',
            severity: 'warning',
            outcome: 'failure',
            subjectType: $attemptedUser ? 'user' : 'authentication_identity',
            subjectId: $attemptedUser?->getKey(),
            subjectHash: $this->fingerprint->subject($identifier),
            metadata: [
                'reason' => $reason,
                'failure_count' => $failureCount,
                'retry_after_seconds' => $retryAfter,
            ],
        );
    }

    public function loginSucceeded(Request $request, User $user, bool $remember): void
    {
        $this->record(
            request: $request,
            event: 'auth.login.succeeded',
            category: 'authentication',
            severity: 'info',
            outcome: 'success',
            actor: $user,
            subjectType: 'user',
            subjectId: (string) $user->getKey(),
            subjectHash: $this->fingerprint->subject((string) $user->email),
            metadata: [
                'account_type' => $user->account_type,
                'remember' => $remember,
            ],
        );
    }

    public function loginThrottled(
        Request $request,
        string $identifier,
        int $retryAfter,
        string $source,
    ): void {
        $subjectHash = $this->fingerprint->subject($identifier);
        $ipHash = $this->fingerprint->ip($request) ?? 'unknown';
        $scope = $source === 'request_rate_limit'
            ? $ipHash
            : $subjectHash.'|'.$ipHash;
        $dedupeKey = 'audit-login-throttled:'.$source.':'.$scope;

        if (RateLimiter::tooManyAttempts($dedupeKey, 1)) {
            return;
        }

        RateLimiter::hit($dedupeKey, 60);

        $this->record(
            request: $request,
            event: 'auth.login.throttled',
            category: 'security',
            severity: 'warning',
            outcome: 'blocked',
            subjectType: 'authentication_identity',
            subjectHash: $subjectHash,
            metadata: [
                'source' => $source,
                'retry_after_seconds' => max(1, $retryAfter),
            ],
        );
    }

    public function passwordResetRequested(Request $request, string $identifier): void
    {
        $this->record(
            request: $request,
            event: 'auth.password.reset_requested',
            category: 'authentication',
            severity: 'info',
            outcome: 'neutral',
            subjectType: 'authentication_identity',
            subjectHash: $this->fingerprint->subject($identifier),
        );
    }

    public function passwordResetSucceeded(Request $request, User $user): void
    {
        $this->record(
            request: $request,
            event: 'auth.password.reset',
            category: 'security',
            severity: 'info',
            outcome: 'success',
            actor: $user,
            subjectType: 'user',
            subjectId: (string) $user->getKey(),
        );
    }

    /** @param list<string> $fields */
    public function profileUpdated(Request $request, User $user, array $fields): void
    {
        $this->record(
            request: $request,
            event: 'user.profile.updated',
            category: 'data_change',
            severity: 'info',
            outcome: 'success',
            actor: $user,
            subjectType: 'user',
            subjectId: (string) $user->getKey(),
            resourceType: 'user',
            resourceId: (string) $user->getKey(),
            metadata: ['fields' => array_values(array_unique($fields))],
        );
    }

    public function sessionRevoked(Request $request, User $user, bool $currentSession): void
    {
        $this->record(
            request: $request,
            event: 'auth.session.revoked',
            category: 'security',
            severity: 'info',
            outcome: 'success',
            actor: $user,
            subjectType: 'user',
            subjectId: (string) $user->getKey(),
            metadata: ['current_session' => $currentSession],
        );
    }

    /** @param array<string, mixed> $metadata */
    public function record(
        ?Request $request,
        string $event,
        string $category,
        string $severity = 'info',
        string $outcome = 'success',
        ?User $actor = null,
        ?string $subjectType = null,
        ?string $subjectId = null,
        ?string $subjectHash = null,
        ?string $resourceType = null,
        ?string $resourceId = null,
        ?string $contextType = null,
        ?string $contextId = null,
        ?string $correlationId = null,
        array $metadata = [],
        ?string $auditType = null,
    ): void {
        try {
            $agent = $request ? trim((string) $request->userAgent()) : '';

            AuditLog::query()->create([
                'event' => Str::limit(trim($event), 120, ''),
                'category' => Str::limit(trim($category), 32, ''),
                'audit_type' => $this->auditType($auditType, $event, $category, $resourceType),
                'severity' => $this->severity($severity),
                'outcome' => $this->outcome($outcome),
                'actor_user_id' => $actor?->getKey(),
                'actor_name' => $actor ? Str::limit(trim((string) $actor->name), 255, '') : null,
                'subject_type' => $this->nullableLimited($subjectType, 80),
                'subject_id' => $this->nullableLimited($subjectId, 191),
                'subject_hash' => $this->nullableLimited($subjectHash, 64),
                'resource_type' => $this->nullableLimited($resourceType, 80),
                'resource_id' => $this->nullableLimited($resourceId, 191),
                'context_type' => $this->nullableLimited($contextType, 80),
                'context_id' => $this->nullableLimited($contextId, 191),
                'ip_hash' => $request ? $this->fingerprint->ip($request) : null,
                'user_agent' => $agent === '' ? null : Str::limit($agent, 500, ''),
                'request_id' => $request ? $this->requestId($request) : null,
                'correlation_id' => $this->nullableLimited($correlationId, 100),
                'metadata' => $metadata === [] ? null : $this->sanitizeMetadata($metadata),
                'happened_at' => now(),
            ]);
        } catch (Throwable $exception) {
            // Audit persistence must not turn a successful business operation
            // into an outage. Never copy event payloads or identifiers into the
            // fallback application log.
            Log::error('Audit persistence failed.', [
                'event' => $event,
                'category' => $category,
                'exception' => $exception::class,
            ]);
        }
    }

    private function requestId(Request $request): string
    {
        $existing = trim((string) $request->attributes->get('request_id', ''));
        if ($existing !== '') {
            return Str::limit($existing, 100, '');
        }

        $header = trim((string) $request->headers->get('X-Request-ID', ''));
        $requestId = preg_match('/^[A-Za-z0-9._:-]{8,100}$/', $header) === 1
            ? $header
            : (string) Str::uuid();

        $request->attributes->set('request_id', $requestId);

        return $requestId;
    }

    /** @param array<string, mixed> $metadata */
    private function sanitizeMetadata(array $metadata): array
    {
        $sanitized = [];

        foreach ($metadata as $key => $value) {
            $normalizedKey = strtolower((string) preg_replace('/[^a-z0-9]/i', '', (string) $key));

            if (in_array($normalizedKey, self::SENSITIVE_METADATA_KEYS, true)) {
                $sanitized[$key] = '[REDACTED]';
                continue;
            }

            $sanitized[$key] = is_array($value)
                ? $this->sanitizeMetadata($value)
                : $value;
        }

        return $sanitized;
    }

    private function auditType(?string $explicit, string $event, string $category, ?string $resourceType): string
    {
        $type = strtolower(trim((string) $explicit));
        if (in_array($type, ['security', 'business', 'object', 'mcp', 'portal', 'system'], true)) {
            return $type;
        }

        if (str_starts_with($event, 'mcp.')) {
            return 'mcp';
        }

        if ($category === 'portal') {
            return 'portal';
        }

        if (in_array($category, ['security', 'authentication'], true)) {
            return 'security';
        }

        if (in_array($resourceType, [
            'property',
            'unit',
            'meter',
            'waste_container',
            'parking_space',
            'unit_facility',
            'unit_facility_event',
        ], true)) {
            return 'object';
        }

        if (in_array($category, ['data_change', 'document'], true)) {
            return 'business';
        }

        return 'system';
    }

    private function severity(string $severity): string
    {
        return in_array($severity, ['info', 'warning', 'high', 'critical'], true)
            ? $severity
            : 'info';
    }

    private function outcome(string $outcome): string
    {
        return in_array($outcome, ['success', 'failure', 'blocked', 'neutral'], true)
            ? $outcome
            : 'neutral';
    }

    private function nullableLimited(?string $value, int $limit): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }

        return Str::limit(trim($value), $limit, '');
    }
}
