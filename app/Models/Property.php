<?php

namespace App\Models;

use App\Contracts\Framework\DefinesModelFeatures;
use App\Domain\Property\Enums\ManagementType;
use App\Domain\Property\Enums\PropertyStatus;
use App\Domain\Property\Enums\PropertyType;
use App\Framework\HasModelFeatures;
use App\Framework\ModelFeatures;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Property extends Model implements DefinesModelFeatures
{
    use HasFactory, SoftDeletes;
    use HasModelFeatures;

    public static function framework(): ModelFeatures
    {
        return ModelFeatures::make()->label('Objekte')
            ->search(subtitle: ['code', 'city'], priority: 10)
            ->audit(fields: ['code', 'name', 'status', 'city', 'street', 'house_number', 'postal_code'])
            ->import(
                fields: ['code', 'name', 'type', 'management_type', 'status', 'street', 'house_number', 'postal_code', 'city', 'country', 'construction_year', 'land_area', 'management_started_on', 'next_inspection_on'],
                aliases: ['code' => ['Objektnummer', 'Objekt-Nr.'], 'name' => ['Objektname']],
            );
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
