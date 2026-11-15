<?php

namespace App\Models;

use App\Contracts\Framework\HasAuditTrail;
use App\Domain\Property\Enums\ManagementType;
use App\Domain\Property\Enums\PropertyStatus;
use App\Domain\Property\Enums\PropertyType;
use App\Framework\AuditDefinition;
use App\Framework\RecordsAuditTrail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Property extends Model implements HasAuditTrail
{
    use HasFactory, SoftDeletes;
    use RecordsAuditTrail;

    public static function auditTrail(): AuditDefinition
    {
        return new AuditDefinition(fields: ['code', 'name', 'status', 'city', 'street', 'house_number', 'postal_code']);
    }

    protected $guarded = ['id'];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'type' => PropertyType::class,
            'status' => PropertyStatus::class,
            'management_type' => ManagementType::class,
            'land_area' => 'float',
            'construction_year' => 'integer',
            'management_started_on' => 'date',
            'next_inspection_on' => 'date',
        ];
    }

    public function units(): HasMany
    {
        return $this->hasMany(Unit::class);
    }
}
