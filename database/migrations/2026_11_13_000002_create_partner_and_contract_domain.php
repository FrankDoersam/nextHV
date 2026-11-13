<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_partners', function (Blueprint $t) {
            $t->id();
            $t->string('code', 40)->unique();
            $t->string('kind', 20)->default('person');
            $t->string('display_name', 160);
            $t->string('first_name', 100)->nullable();
            $t->string('last_name', 100)->nullable();
            $t->string('company_name', 160)->nullable();
            $t->date('birth_date')->nullable();
            $t->string('email', 190)->nullable();
            $t->string('phone', 50)->nullable();
            $t->string('street', 160)->nullable();
            $t->string('postal_code', 20)->nullable();
            $t->string('city', 100)->nullable();
            $t->char('country', 2)->default('DE');
            $t->string('commercial_register', 100)->nullable();
            $t->text('notes')->nullable();
            $t->timestamps(6);
            $t->softDeletes();
        });
        Schema::create('partner_roles', function (Blueprint $t) {
            $t->id();
            $t->foreignId('business_partner_id')->constrained()->cascadeOnDelete();
            $t->string('role', 30);
            $t->unique(['business_partner_id', 'role']);
            $t->timestamps(6);
        });
        Schema::create('contracts', function (Blueprint $t) {
            $t->id();
            $t->string('code', 40)->unique();
            $t->foreignId('unit_id')->constrained()->restrictOnDelete();
            $t->string('type', 30)->default('residential_lease');
            $t->string('status', 20)->default('draft')->index();
            $t->date('starts_on');
            $t->date('ends_on')->nullable();
            $t->unsignedSmallInteger('notice_period_months')->default(3);
            $t->unsignedTinyInteger('payment_day')->default(3);
            $t->decimal('deposit', 12, 2)->default(0);
            $t->string('deposit_status', 20)->default('outstanding');
            $t->text('notes')->nullable();
            $t->timestamps(6);
            $t->softDeletes();
            $t->index(['unit_id', 'status', 'starts_on', 'ends_on']);
        });
        Schema::create('contract_parties', function (Blueprint $t) {
            $t->id();
            $t->foreignId('contract_id')->constrained()->restrictOnDelete();
            $t->foreignId('business_partner_id')->constrained()->restrictOnDelete();
            $t->string('role', 30)->default('tenant');
            $t->boolean('is_primary')->default(false);
            $t->timestamps(6);
            $t->unique(['contract_id', 'business_partner_id', 'role']);
        });
        Schema::create('rent_conditions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('contract_id')->constrained()->restrictOnDelete();
            $t->date('effective_from');
            $t->decimal('base_rent', 12, 2);
            $t->decimal('service_charge', 12, 2)->default(0);
            $t->decimal('heating_cost', 12, 2)->default(0);
            $t->decimal('vat_rate', 5, 2)->default(0);
            $t->string('reason', 190)->nullable();
            $t->timestamps(6);
            $t->unique(['contract_id', 'effective_from']);
        });
        Schema::create('identity_documents', function (Blueprint $t) {
            $t->id();
            $t->foreignId('business_partner_id')->constrained()->restrictOnDelete();
            $t->string('type', 30)->default('identity_card');
            $t->string('title', 160);
            $t->text('document_number')->nullable();
            $t->string('number_last_four', 4)->nullable();
            $t->char('issuing_country', 2)->default('DE');
            $t->date('expires_on')->nullable();
            $t->date('verified_on')->nullable();
            $t->string('storage_path')->nullable();
            $t->string('mime_type', 100)->nullable();
            $t->unsignedInteger('size')->nullable();
            $t->timestamps(6);
            $t->softDeletes();
        });
    }

    public function down(): void
    {
        foreach (['identity_documents', 'rent_conditions', 'contract_parties', 'contracts', 'partner_roles', 'business_partners'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
