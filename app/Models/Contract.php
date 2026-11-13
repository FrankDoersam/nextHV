<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contract extends Model
{
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
