<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('properties', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name', 160);
            $table->string('type', 30)->default('residential');
            $table->string('management_type', 30)->default('rental');
            $table->string('status', 30)->default('active')->index();
            $table->string('street', 160);
            $table->string('house_number', 20);
            $table->string('postal_code', 20);
            $table->string('city', 100)->index();
            $table->char('country', 2)->default('DE');
            $table->unsignedSmallInteger('construction_year')->nullable();
            $table->decimal('land_area', 12, 2)->nullable();
            $table->string('manager_name', 120)->nullable();
            $table->string('manager_email', 190)->nullable();
            $table->string('manager_phone', 50)->nullable();
            $table->string('heating_type', 60)->nullable();
            $table->string('energy_class', 10)->nullable();
            $table->date('management_started_on')->nullable();
            $table->date('next_inspection_on')->nullable()->index();
            $table->text('notes')->nullable();
            $table->timestamps(6);
            $table->softDeletes();
        });
        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained()->restrictOnDelete();
            $table->string('code', 40);
            $table->string('name', 160);
            $table->string('type', 30)->default('apartment')->index();
            $table->string('status', 30)->default('ready')->index();
            $table->string('floor', 30)->nullable();
            $table->decimal('area', 12, 2)->default(0);
            $table->decimal('rooms', 5, 1)->default(0);
            $table->boolean('has_balcony')->default(false);
            $table->boolean('barrier_free')->default(false);
            $table->text('notes')->nullable();
            $table->timestamps(6);
            $table->softDeletes();
            $table->unique(['property_id', 'code']);
            $table->index(['property_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('units');
        Schema::dropIfExists('properties');
    }
};
