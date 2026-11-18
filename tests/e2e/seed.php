<?php

use App\Models\BusinessPartner;
use App\Models\IdentityDocument;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Hash;

/** Run only against the dedicated E2E database after migration. */
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('testing') || basename(config('database.connections.sqlite.database')) !== 'e2e.sqlite') {
    throw new RuntimeException('E2E setup requires APP_ENV=testing and a dedicated e2e.sqlite database.');
}
foreach (['e2e@example.test', 'enterprise-e2e@example.test', 'workspace-e2e@example.test'] as $email) {
    User::updateOrCreate(['email' => $email], [
        'name' => 'Browser Test', 'password' => Hash::make(getenv('E2E_PASSWORD') ?: 'local-e2e-password-only'),
    ]);
}

$partner = BusinessPartner::firstOrFail();
IdentityDocument::updateOrCreate(['title' => 'Browser-Nachweis'], [
    'business_partner_id' => $partner->id, 'type' => 'residence_permit', 'issuing_country' => 'DE', 'expires_on' => null, 'verified_on' => null,
]);
