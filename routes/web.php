<?php

use App\Http\Controllers\Auth\SessionController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [SessionController::class, 'store'])->middleware('throttle:login');
Route::middleware('auth')->group(function () {
    Route::get('/auth/user', [SessionController::class, 'show']);
    Route::post('/auth/logout', [SessionController::class, 'destroy']);
});
// Missing /build/assets/* files must return 404, not the SPA HTML page.
Route::view('/{path?}', 'app')
    ->where('path', '^(?!(?:api|auth|sanctum|docs|build)(?:/|$)).*$')
    ->name('login');
