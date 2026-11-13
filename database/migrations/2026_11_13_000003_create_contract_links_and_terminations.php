<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $t) {
            $t->date('signed_on')->nullable();
            $t->date('minimum_term_until')->nullable();
            $t->string('notice_to', 30)->default('month_end');
        });
        Schema::create('contract_links', function (Blueprint $t) {
            $t->id();
            $t->foreignId('contract_id')->constrained()->restrictOnDelete();
            $t->foreignId('related_contract_id')->constrained('contracts')->restrictOnDelete();
            $t->string('type', 30)->default('ancillary');
            $t->text('notes')->nullable();
            $t->timestamps(6);
            $t->unique(['contract_id', 'related_contract_id']);
        });
        Schema::create('termination_notices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('contract_id')->constrained()->restrictOnDelete();
            $t->string('status', 20)->default('received');
            $t->string('type', 30)->default('ordinary');
            $t->string('initiated_by', 20)->default('tenant');
            $t->date('declared_on');
            $t->date('received_on');
            $t->date('requested_end_on');
            $t->date('confirmed_end_on')->nullable();
            $t->string('delivery_method', 30)->default('letter');
            $t->string('reason', 190);
            $t->text('notes')->nullable();
            $t->timestamps(6);
            $t->index(['contract_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('termination_notices');
        Schema::dropIfExists('contract_links');
        Schema::table('contracts', fn (Blueprint $t) => $t->dropColumn(['signed_on', 'minimum_term_until', 'notice_to']));
    }
};
