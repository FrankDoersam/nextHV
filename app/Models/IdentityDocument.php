<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class IdentityDocument extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected $hidden = ['document_number', 'storage_path'];

    protected function casts(): array
    {
        return ['document_number' => 'encrypted', 'expires_on' => 'date', 'verified_on' => 'date', 'size' => 'integer'];
    }

    public function businessPartner(): BelongsTo
    {
        return $this->belongsTo(BusinessPartner::class);
    }
}
