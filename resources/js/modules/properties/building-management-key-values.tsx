import {
    EditableKeyValueList,
    type KeyValueProperty,
} from "@/framework/forms/editable-key-value-list";
import type { RecordData } from "@/framework/types";
import { date, label, number } from "@/lib/format";
import { properties } from "./properties-resource";

/**
 * Compact property overview: explicit, permission-aware single-field editing.
 * Uses the shared versioned mutation path (including server errors and 409 reload)
 * instead of submitting a second full property form.
 */
const buildingManagementFields: KeyValueProperty[] = [
    {
        name: "management_type",
        editable: true,
        render: (value) => label(value),
    },
    { name: "type", editable: true, render: (value) => label(value) },
    {
        name: "construction_year",
        editable: true,
        render: (value) => (value == null ? "—" : String(value)),
    },
    {
        name: "land_area",
        editable: true,
        render: (value) =>
            value == null || value === "" ? "—" : `${number(value, 2)} m²`,
    },
    {
        name: "heating_type",
        editable: true,
        render: (value) => (value ? String(value) : "—"),
    },
    {
        name: "energy_class",
        editable: true,
        render: (value) => (value ? String(value) : "—"),
    },
    {
        name: "management_started_on",
        editable: true,
        render: (value) => date(value),
    },
];

const propertySections = {
    general: [
        "code",
        "name",
        "type",
        "status",
        "street",
        "house_number",
        "postal_code",
        "city",
        "country",
    ],
    management: [
        "management_type",
        "manager_name",
        "manager_email",
        "manager_phone",
        "management_started_on",
        "next_inspection_on",
    ],
    building: [
        "construction_year",
        "land_area",
        "heating_type",
        "energy_class",
    ],
} as const;

/** Detail sections share the established seven-field inline-edit allowlist. */
export function PropertyKeyValues({
    property,
    section,
}: {
    property: RecordData;
    section: keyof typeof propertySections;
}) {
    return (
        <div data-slot={`property-${section}-values`}>
            <EditableKeyValueList
                resource={properties}
                record={property}
                properties={propertySections[section].map(
                    (name) =>
                        buildingManagementFields.find(
                            (field) => field.name === name,
                        ) ?? name,
                )}
            />
        </div>
    );
}

export function BuildingManagementKeyValues({
    property,
}: {
    property: RecordData;
}) {
    return (
        <div data-slot="property-building-management" className="min-w-0">
            <EditableKeyValueList
                resource={properties}
                record={property}
                properties={buildingManagementFields}
            />
        </div>
    );
}
