<?php

namespace App\Models;

use App\Framework\Crud\CrudRules;
use App\Framework\Crud\HasCrudRules;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class IdentityDocument extends Model
{
    use HasCrudRules;

    public static function crudRules(): CrudRules
    {
        return CrudRules::make()
            ->default('type', 'identity_card')
            ->default('issuing_country', 'DE')
            ->createOnly('business_partner_id');
    }

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
