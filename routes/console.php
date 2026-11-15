<?php

use App\Framework\FeatureRegistry;
use App\Models\ImportBatch;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schedule;

Artisan::command('nexthv:admin {email?} {--name=Administrator}', function () {
    $email = $this->argument('email') ?? $this->ask('E-Mail');
    $password = $this->secret('Passwort (mindestens 12 Zeichen)');
    if (! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password ?? '') < 12) {
        $this->error('Gültige E-Mail und mindestens 12 Zeichen erforderlich.');

        return 1;
    }
    if (User::where('email', $email)->exists()) {
        $this->error('Benutzer existiert bereits.');

        return 1;
    }
    User::create(['name' => $this->option('name'), 'email' => $email, 'password' => Hash::make($password)]);
    $this->info('Benutzer angelegt.');
})->purpose('Create an application login without a hard-coded password');

Schedule::command('model:prune', ['--model' => ImportBatch::class])->daily();

Artisan::command('framework:check', function (FeatureRegistry $features) {
    try {
        foreach ($features->all(applyAvailability: false) as $name => $definition) {
            $this->line($name.': '.implode(', ', array_filter([
                $definition['search'] ? 'search' : null,
                $definition['audit'] ? 'audit' : null,
                $definition['import'] ? 'import' : null,
            ])));
        }
    } catch (LogicException $exception) {
        $this->error($exception->getMessage());

        return 1;
    }
    $this->info('Resource capabilities and model audit definitions are valid.');

    return 0;
})->purpose('Validate resource search/import capabilities and model audit declarations against the REST schema');
