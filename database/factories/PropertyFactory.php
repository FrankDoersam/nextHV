<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class PropertyFactory extends Factory
{
    public function definition(): array
    {
        return ['code' => fake()->unique()->bothify('OBJ-####??'), 'name' => fake()->streetName(), 'street' => fake()->streetName(), 'house_number' => '1', 'postal_code' => '10115', 'city' => 'Berlin', 'country' => 'DE', 'type' => 'residential', 'management_type' => 'rental', 'status' => 'active'];
    }
}
