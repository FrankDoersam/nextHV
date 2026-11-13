<?php

use App\Framework\Crud\CrudRegistry;
use App\Http\Controllers\CrudMetadataController;
use App\Http\Controllers\IdentityFileController;
use Illuminate\Support\Facades\Route;
use Lomkit\Rest\Facades\Rest;

Route::middleware(['auth:sanctum', 'throttle:api'])->prefix('v1')->group(function () {
    Route::get('_meta/resources/{resource}', [CrudMetadataController::class, 'show']);
    foreach (CrudRegistry::controllers() as $resource => $controller) {
        Rest::resource($resource, $controller);
    }
    Route::post('identity-documents/{document}/file', [IdentityFileController::class, 'store']);
    Route::get('identity-documents/{document}/file', [IdentityFileController::class, 'show']);
});
