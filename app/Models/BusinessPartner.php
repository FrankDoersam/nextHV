<?php

namespace App\Models;

use App\Framework\Crud\CrudRules;
use App\Framework\Crud\DeleteFilter;
use App\Framework\Crud\HasCrudRules;

use Illuminate\Database\Eloquent\Casts\Attribute;
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
            ->restrictDelete(
                'contractParties',
                'Geschäftspartner mit aktivem Vertrag können nicht gelöscht werden.',
                false,
                'partner',
                DeleteFilter::make()->whereHas(
                    'contract',
                    DeleteFilter::make()->where('status', 'active'),
                ),
            )
            ->cloneUnique(['code'])
            ->cloneRelation('roles');
    }

    use SoftDeletes;

    protected $guarded = ['id'];

    protected $appends = ['full_name'];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return ['birth_date' => 'date'];
    }

    protected function fullName(): Attribute
    {
        return Attribute::get(function (): string {
            $personalName = trim(implode(' ', array_filter(
                [$this->first_name, $this->last_name],
                fn ($name) => is_string($name) && trim($name) !== ''
            )));

            return $personalName !== ''
                ? $personalName
                : ($this->company_name ?: $this->display_name);
        });
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
