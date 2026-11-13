<?php

namespace Database\Factories;

use App\Models\Property;
use Illuminate\Database\Eloquent\Factories\Factory;

class UnitFactory extends Factory
{
    public function definition(): array
    {
        return ['property_id' => Property::factory(), 'code' => fake()->unique()->bothify('E-####??'), 'name' => 'Wohnung', 'type' => 'apartment', 'status' => 'ready', 'area' => 72.5, 'rooms' => 3];
    }
}
