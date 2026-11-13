<?php

namespace App\Models;

use App\Framework\Crud\CrudRules;
use App\Framework\Crud\HasCrudRules;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContractParty extends Model
{
    use HasCrudRules;

    public static function crudRules(): CrudRules
    {
        return CrudRules::make()
            ->default('role', 'tenant')
            ->default('is_primary', false)
            ->createOnly('contract_id');
    }

    protected $guarded = ['id'];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return ['is_primary' => 'boolean'];
    }

    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    public function businessPartner(): BelongsTo
    {
        return $this->belongsTo(BusinessPartner::class);
    }
}
