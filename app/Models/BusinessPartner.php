<?php

namespace App\Models;

use App\Framework\Crud\CrudRules;
use App\Framework\Crud\HasCrudRules;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class BusinessPartner extends Model
{
    use HasCrudRules;

    public static function crudRules(): CrudRules
    {
        return CrudRules::make()
            ->default('kind', 'person')
            ->default('country', 'DE')
            ->restrictDelete('contractParties', 'Geschäftspartner mit Vertragsbezug können nicht gelöscht werden.', false, 'partner');
    }

    use SoftDeletes;

    protected $guarded = ['id'];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return ['birth_date' => 'date'];
    }

    public function roles(): HasMany
    {
        return $this->hasMany(PartnerRole::class);
    }

    public function contractParties(): HasMany
    {
        return $this->hasMany(ContractParty::class);
    }

    public function identityDocuments(): HasMany
    {
        return $this->hasMany(IdentityDocument::class);
    }
}
