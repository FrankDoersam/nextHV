<?php

namespace App\Models;

use App\Framework\Crud\CrudRules;
use App\Framework\Crud\HasCrudRules;

use App\Domain\Property\Enums\UnitStatus;
use App\Domain\Property\Enums\UnitType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Unit extends Model
{
    use HasCrudRules;

    public static function crudRules(): CrudRules
    {
        return CrudRules::make()
            ->default('type', 'apartment')
            ->default('status', 'ready')
            ->default('area', 0)
            ->default('rooms', 0)
            ->default('has_balcony', false)
            ->default('barrier_free', false)
            ->restrictDelete('contracts', 'Einheiten mit Vertragshistorie können nicht gelöscht werden.', true, 'unit')
            ->cloneUnique(['property_id', 'code'])
            ->cloneOverride('status', 'ready');
    }

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
