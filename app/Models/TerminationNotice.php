<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TerminationNotice extends Model
{
    protected $guarded = ['id'];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return ['declared_on' => 'date', 'received_on' => 'date', 'requested_end_on' => 'date', 'confirmed_end_on' => 'date'];
    }

    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }
}
