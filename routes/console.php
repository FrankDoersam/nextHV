<?php

use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;

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
