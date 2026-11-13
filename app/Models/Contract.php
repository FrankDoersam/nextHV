<?php

namespace App\Models;

use App\Framework\Crud\CrudRules;
use App\Framework\Crud\HasCrudRules;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contract extends Model
{
    use HasCrudRules;

    public static function crudRules(): CrudRules
    {
        return CrudRules::make()
            ->default('status', 'draft')
            ->default('type', 'residential_lease')
            ->default('notice_period_months', 3)
            ->default('payment_day', 3)
            ->default('deposit', 0)
            ->default('deposit_status', 'outstanding')
            ->preventDeleteWhen(
                fn (Contract $contract): bool => $contract->status !== 'draft',
                'Aktive oder historische Verträge bleiben erhalten. Vertrag beenden statt löschen.',
                'contract',
            )
            ->protectWhen(
                fn (Contract $contract): bool => $contract->getRawOriginal('status') !== 'draft',
                ['unit_id', 'starts_on', 'ends_on', 'type', 'deposit', 'notice_period_months', 'payment_day', 'signed_on', 'minimum_term_until', 'notice_to'],
                'Vertragsstammdaten sind nach Aktivierung geschützt. Konditionen separat fortschreiben.',
                'contract',
            );
    }

    use SoftDeletes;

    protected $attributes = ['status' => 'draft'];

    protected $guarded = ['id'];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'signed_on' => 'date',
            'minimum_term_until' => 'date',
            'starts_on' => 'date',
            'ends_on' => 'date',
            'deposit' => 'float',
            'notice_period_months' => 'integer',
            'payment_day' => 'integer',
        ];
    }

    public function links(): HasMany
    {
        return $this->hasMany(ContractLink::class);
    }

    public function incomingLinks(): HasMany
    {
        return $this->hasMany(ContractLink::class, 'related_contract_id');
    }

    public function terminations(): HasMany
    {
        return $this->hasMany(TerminationNotice::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function parties(): HasMany
    {
        return $this->hasMany(ContractParty::class);
    }

    public function conditions(): HasMany
    {
        return $this->hasMany(RentCondition::class)->orderBy('effective_from');
    }
}
