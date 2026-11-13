<?php

use App\Http\Controllers\Auth\SessionController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [SessionController::class, 'store'])->middleware('throttle:login');
Route::middleware('auth')->group(function () {
    Route::get('/auth/user', [SessionController::class, 'show']);
    Route::post('/auth/logout', [SessionController::class, 'destroy']);
});
Route::view('/{path?}', 'app')->where('path', '^(?!api|auth|sanctum|docs).*$')->name('login');
