<?php

namespace Database\Seeders;

use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\Property;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/** Deterministic and repeatable: existing rows are preserved, never overwritten. */
class PropertySeeder extends Seeder
{
    public function run(): void
    {
        $properties = [['Lindenhöfe', 'Lindenstraße', '24', '10969', 'Berlin'], ['Am Stadtgarten', 'Gartenstraße', '8', '14467', 'Potsdam'], ['Quartier West', 'Kantstraße', '112', '10627', 'Berlin'], ['Parkresidenz', 'Parkallee', '6', '22303', 'Hamburg'], ['Alte Mühle', 'Mühlenweg', '3', '04109', 'Leipzig'], ['Sonnenhof', 'Sonnenstraße', '18', '80331', 'München'], ['Rheinterrassen', 'Rheinufer', '42', '50668', 'Köln'], ['Am Wasserturm', 'Turmstraße', '9', '68161', 'Mannheim'], ['Elbquartier', 'Elbstraße', '15', '01067', 'Dresden'], ['Birkenhain', 'Birkenweg', '7', '30159', 'Hannover']];
        DB::transaction(function () use ($properties) {
            foreach ($properties as $i => $p) {
                $property = Property::firstOrCreate(['code' => sprintf('OBJ-%03d', $i + 1)], ['name' => $p[0], 'street' => $p[1], 'house_number' => $p[2], 'postal_code' => $p[3], 'city' => $p[4], 'country' => 'DE', 'type' => $i % 3 === 0 ? 'mixed' : 'residential', 'management_type' => $i % 4 === 0 ? 'condominium' : 'rental', 'status' => 'active', 'construction_year' => 1968 + $i * 5, 'land_area' => 720 + $i * 110, 'manager_name' => 'Demo Verwaltung', 'manager_email' => 'verwaltung@example.test', 'manager_phone' => '+49 30 5550 0000', 'heating_type' => $i % 2 ? 'Fernwärme' : 'Wärmepumpe', 'energy_class' => $i % 2 ? 'C' : 'B', 'management_started_on' => '2023-01-01', 'next_inspection_on' => today()->startOfYear()->addMonths($i)->addDays(14), 'notes' => 'Fiktive Demodaten für nextHV.']);
                for ($j = 1; $j <= 5; $j++) {
                    $type = $j === 4 ? 'garage' : ($j === 5 ? ($i % 2 ? 'parking' : 'commercial') : 'apartment');
                    $status = ($j === 3 && $i % 3 === 0) ? 'vacant' : (($j === 5 && $i % 4 === 0) ? 'maintenance' : 'rented');
                    $area = match ($type) {
                        'garage' => 18,'parking' => 12,'commercial' => 95,default => 52 + $j * 12 + $i
                    };
                    $rent = match ($type) {
                        'garage' => 85.50,'parking' => 45.00,'commercial' => 1250.00,default => round($area * (9.8 + $i * .25), 2)
                    };
                    $unit = $property->units()->firstOrCreate(['code' => sprintf('E-%02d', $j)], ['name' => match ($type) {
                        'garage' => 'Garage 01','parking' => 'Stellplatz 01','commercial' => 'Gewerbe · Erdgeschoss',default => "Wohnung 0{$j}"
                    }, 'type' => $type, 'status' => $status === 'maintenance' ? 'maintenance' : 'ready', 'floor' => $j <= 3 ? (string) ($j - 1) : 'EG', 'area' => $area, 'rooms' => $type === 'apartment' ? $j + 1 : 0, 'has_balcony' => $j === 2, 'barrier_free' => $j === 1]);
                    if ($status === 'rented') {
                        $partner = $j === 4 ? BusinessPartner::where('code', sprintf('GP-%03d-%02d', $i + 1, 1))->firstOrFail() : BusinessPartner::firstOrCreate(['code' => sprintf('GP-%03d-%02d', $i + 1, $j)], ['display_name' => 'Demo '.['Müller', 'Schmidt', 'Weber', 'Fischer', 'Becker'][$j - 1].' '.($i + 1), 'first_name' => 'Demo', 'last_name' => ['Müller', 'Schmidt', 'Weber', 'Fischer', 'Becker'][$j - 1], 'kind' => 'person', 'email' => sprintf('mieter-%d-%d@example.test', $i + 1, $j), 'city' => $p[4], 'country' => 'DE']);
                        $partner->roles()->firstOrCreate(['role' => 'tenant']);
                        $contract = Contract::firstOrCreate(['code' => sprintf('MV-%03d-%02d', $i + 1, $j)], ['unit_id' => $unit->id, 'type' => match ($type) {
                            'garage' => 'garage_lease','parking' => 'parking_lease','commercial' => 'commercial_lease',default => 'residential_lease'
                        }, 'status' => 'draft', 'starts_on' => today()->subYears(2)->startOfYear(), 'deposit' => $rent * 3, 'deposit_status' => 'received', 'signed_on' => today()->subYears(2)->startOfYear()->subDays(10), 'minimum_term_until' => today()->subYear()->startOfYear()]);
                        if ($contract->wasRecentlyCreated) {
                            $contract->parties()->create(['business_partner_id' => $partner->id, 'role' => 'tenant', 'is_primary' => true]);
                            $contract->conditions()->create(['effective_from' => $contract->starts_on, 'base_rent' => round($rent * .95, 2), 'service_charge' => $j <= 3 ? 125 : 15, 'heating_cost' => $j <= 3 ? 65 : 0, 'reason' => 'Mietbeginn']);
                            $contract->conditions()->create(['effective_from' => today()->startOfYear(), 'base_rent' => $rent, 'service_charge' => $j <= 3 ? 135.50 : 15, 'heating_cost' => $j <= 3 ? 75 : 0, 'reason' => 'Jährliche Konditionsanpassung']);
                            $contract->update(['status' => 'active']);
                            if ($j === 4) {
                                $main = Contract::where('code', sprintf('MV-%03d-%02d', $i + 1, 1))->firstOrFail();
                                $main->links()->firstOrCreate(['related_contract_id' => $contract->id], ['type' => 'ancillary', 'notes' => 'Separater Garagenmietvertrag zum Wohnraummietvertrag.']);
                            }
                        }
                    }
                }
            }
        });
    }
}
