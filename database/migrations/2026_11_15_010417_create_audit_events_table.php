<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_events', function (Blueprint $table): void {
            $table->id();
            $table->string('resource', 80);
            $table->unsignedBigInteger('record_id');
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_name', 160);
            $table->string('event', 20);
            $table->json('changes');
            $table->timestamp('created_at', 6);
            $table->index(['resource', 'record_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_events');
    }
};
