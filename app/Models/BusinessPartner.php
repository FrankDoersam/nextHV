<?php

namespace App\Models;

use App\Contracts\Framework\HasAuditTrail;
use App\Framework\AuditDefinition;
use App\Framework\RecordsAuditTrail;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class BusinessPartner extends Model implements HasAuditTrail
{
    use RecordsAuditTrail;
    use SoftDeletes;

    public static function auditTrail(): AuditDefinition
    {
        return new AuditDefinition(fields: ['code', 'display_name', 'kind']);
    }

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
