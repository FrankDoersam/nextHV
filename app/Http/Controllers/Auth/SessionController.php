<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class SessionController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $credentials = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string'], 'remember' => ['sometimes', 'boolean']]);
        if (! Auth::attempt(['email' => $credentials['email'], 'password' => $credentials['password']], $request->boolean('remember'))) {
            throw ValidationException::withMessages(['email' => 'E-Mail-Adresse oder Passwort ist nicht korrekt.']);
        }
        $request->session()->regenerate();

        return response()->json(['data' => $request->user()->only('id', 'name', 'email')]);
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->only('id', 'name', 'email')]);
    }

    public function destroy(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Abgemeldet.']);
    }
}
