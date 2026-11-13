<?php

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
User::updateOrCreate(['email' => 'e2e@example.test'], [
    'name' => 'Browser Test', 'password' => Hash::make(getenv('E2E_PASSWORD') ?: 'local-e2e-password-only'),
]);
