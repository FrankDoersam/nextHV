<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContractLink extends Model
{
    protected $guarded = ['id'];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    public function relatedContract(): BelongsTo
    {
        return $this->belongsTo(Contract::class, 'related_contract_id');
    }
}
