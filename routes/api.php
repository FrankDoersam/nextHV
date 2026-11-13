<?php

use App\Http\Controllers\IdentityFileController;
use App\Rest\Controllers\BusinessPartnerController;
use App\Rest\Controllers\ContractController;
use App\Rest\Controllers\ContractLinkController;
use App\Rest\Controllers\ContractPartyController;
use App\Rest\Controllers\IdentityDocumentController;
use App\Rest\Controllers\PartnerRoleController;
use App\Rest\Controllers\PropertyController;
use App\Rest\Controllers\RentConditionController;
use App\Rest\Controllers\TerminationNoticeController;
use App\Rest\Controllers\UnitController;
use Illuminate\Support\Facades\Route;
use Lomkit\Rest\Facades\Rest;

Route::middleware(['auth:sanctum', 'throttle:api'])->prefix('v1')->group(function () {
    Rest::resource('properties', PropertyController::class);
    Rest::resource('contract-links', ContractLinkController::class);
    Rest::resource('termination-notices', TerminationNoticeController::class);
    Rest::resource('units', UnitController::class);
    Rest::resource('business-partners', BusinessPartnerController::class);
    Rest::resource('partner-roles', PartnerRoleController::class);
    Rest::resource('contracts', ContractController::class);
    Rest::resource('contract-parties', ContractPartyController::class);
    Rest::resource('rent-conditions', RentConditionController::class);
    Rest::resource('identity-documents', IdentityDocumentController::class);
    Route::post('identity-documents/{document}/file', [IdentityFileController::class, 'store']);
    Route::get('identity-documents/{document}/file', [IdentityFileController::class, 'show']);
});
