<?php

namespace App\Models;

use App\Contracts\Framework\HasAuditTrail;
use App\Domain\Property\Enums\UnitStatus;
use App\Domain\Property\Enums\UnitType;
use App\Framework\AuditDefinition;
use App\Framework\RecordsAuditTrail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Unit extends Model implements HasAuditTrail
{
    use HasFactory, SoftDeletes;
    use RecordsAuditTrail;

    public static function auditTrail(): AuditDefinition
    {
        return new AuditDefinition(fields: ['code', 'name', 'property_id', 'type', 'status', 'area']);
    }

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
