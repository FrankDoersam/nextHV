<?php

namespace App\Providers;

use App\Contracts\PermissionAdapter;
use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\ContractLink;
use App\Models\ContractParty;
use App\Models\IdentityDocument;
use App\Models\PartnerRole;
use App\Models\Property;
use App\Models\RentCondition;
use App\Models\TerminationNotice;
use App\Models\Unit;
use App\Observers\BusinessPartnerObserver;
use App\Observers\ContractLinkObserver;
use App\Observers\ContractObserver;
use App\Observers\ContractPartyObserver;
use App\Observers\IdentityDocumentObserver;
use App\Observers\PartnerRoleObserver;
use App\Observers\PropertyObserver;
use App\Observers\RentConditionObserver;
use App\Observers\TerminationNoticeObserver;
use App\Observers\UnitObserver;
use App\Support\Permissions\AllowAllAdapter;
use App\Support\Validation\LocalizedValidator;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Translation\Translator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(PermissionAdapter::class, AllowAllAdapter::class);
    }

    public function boot(): void
    {
        Validator::resolver(fn (Translator $translator, array $data, array $rules, array $messages, array $attributes): LocalizedValidator => new LocalizedValidator($translator, $data, $rules, $messages, $attributes));
        Property::observe(PropertyObserver::class);
        Unit::observe(UnitObserver::class);
        Contract::observe(ContractObserver::class);
        RentCondition::observe(RentConditionObserver::class);
        ContractParty::observe(ContractPartyObserver::class);
        PartnerRole::observe(PartnerRoleObserver::class);
        BusinessPartner::observe(BusinessPartnerObserver::class);
        IdentityDocument::observe(IdentityDocumentObserver::class);
        ContractLink::observe(ContractLinkObserver::class);
        TerminationNotice::observe(TerminationNoticeObserver::class);
        RateLimiter::for('login', fn (Request $r) => Limit::perMinute(5)->by(strtolower($r->string('email')).'|'.$r->ip()));
        RateLimiter::for('api', fn (Request $r) => Limit::perMinute(120)->by($r->user()?->id ?? $r->ip()));
        Gate::define('viewApiDocs', fn ($user) => $user !== null);
    }
}
