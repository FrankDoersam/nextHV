<?php

namespace App\Models;

use App\Contracts\Framework\DefinesModelFeatures;
use App\Domain\Property\Enums\UnitStatus;
use App\Domain\Property\Enums\UnitType;
use App\Framework\HasModelFeatures;
use App\Framework\ModelFeatures;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Unit extends Model implements DefinesModelFeatures
{
    use HasFactory, SoftDeletes;
    use HasModelFeatures;

    public static function framework(): ModelFeatures
    {
        return ModelFeatures::make()->label('Einheiten')
            ->search(subtitle: ['property.name', 'property.city', 'code'], priority: 20)
            ->audit(fields: ['code', 'name', 'property_id', 'type', 'status', 'area'])
            ->import(
                fields: ['property_id', 'code', 'name', 'type', 'status', 'floor', 'area', 'rooms', 'has_balcony', 'barrier_free'],
                relations: ['property' => ['code', 'name']],
                aliases: ['property_id' => ['Objektnummer', 'Objekt-Nr.'], 'code' => ['Einheitennummer'], 'name' => ['Einheitenname'], 'status' => ['Zustand']],
            );
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
