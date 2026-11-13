<?php

namespace App\Models;

use App\Domain\Property\Enums\UnitStatus;
use App\Domain\Property\Enums\UnitType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Unit extends Model
{
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'type' => UnitType::class,
            'status' => UnitStatus::class,
            'area' => 'float',
            'rooms' => 'float',
            'has_balcony' => 'boolean',
            'barrier_free' => 'boolean',
        ];
    }

    public function contracts(): HasMany
    {
        return $this->hasMany(Contract::class);
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
