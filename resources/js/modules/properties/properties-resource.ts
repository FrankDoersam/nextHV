import { PropertyNameActions } from "./name-actions";
import { InspectPropertyAction, PropertyReportAction } from "./inspect-action";
import { BulkEditAction, DeleteAction, EditAction } from "@/framework/actions";
import type { ResourceDefinition } from "@/framework/types";
import {
    code,
    col,
    dateField,
    notes,
    numeric,
    opts,
    select,
    text,
} from "@/modules/fields";
import { Building2 } from "lucide-react";
export const properties: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "Stammdaten, Verwaltung und Einheiten eines Objekts.",
    icon: Building2,
    navigationGroup: "Stammdaten",
    titleField: "name",
    supportsClone: true,
    bulkEditable: [
        "manager_name",
        "manager_email",
        "manager_phone",
        "next_inspection_on",
    ],
    groups: [
        { id: "general", label: "Objekt" },
        { id: "address", label: "Adresse" },
        { id: "management", label: "Verwaltung" },
        { id: "details", label: "Gebäude & Hinweise" },
    ],
    fields: [
        code,
        {
            ...text("name", "Bezeichnung", "general", true),
            suffixActions: [new PropertyNameActions()],
        },
        select("type", "Nutzung", ["residential", "commercial", "mixed"]),
        select("management_type", "Verwaltungsart", [
            "rental",
            "condominium",
            "mixed",
        ]),
        select("status", "Status", ["active", "archived"]),
        text("street", "Straße", "address", true),
        {
            ...text("house_number", "Hausnummer", "address", true),
            maxLength: 20,
        },
        { ...text("postal_code", "PLZ", "address", true), maxLength: 20 },
        text("city", "Ort", "address", true),
        {
            ...text("country", "Land (ISO)", "address"),
            default: "DE",
            maxLength: 2,
        },
        text("manager_name", "Ansprechpartner", "management"),
        { ...text("manager_email", "E-Mail", "management"), kind: "email" },
        text("manager_phone", "Telefon", "management"),
        dateField("management_started_on", "Verwaltungsbeginn", "management"),
        dateField("next_inspection_on", "Nächste Objektprüfung", "management"),
        {
            ...numeric("construction_year", "Baujahr", "details"),
            default: null,
            nullable: true,
            min: 1600,
            max: new Date().getFullYear() + 10,
        },
        {
            ...numeric("land_area", "Grundstücksfläche · m²", "details"),
            nullable: true,
        },
        text("heating_type", "Heizung", "details"),
        {
            ...select(
                "energy_class",
                "Energieklasse",
                ["A+", "A", "B", "C", "D", "E", "F", "G", "H"],
                "details",
            ),
            required: false,
            nullable: true,
            default: null,
        },
        notes,
    ],
    columns: [
        col("code", "Nr."),
        col("name", "Objekt"),
        { field: "full_address", label: "Adresse", sortable: false },
        col("type", "Nutzung", "badge"),
        col("units_count", "Einheiten", "number"),
        col("status", "Status", "badge"),
    ],
    aggregates: [{ relation: "units", type: "count" }],
    groupBy: [
        { value: "city", label: "Standort" },
        { value: "type", label: "Nutzung" },
    ],
    filters: [
        {
            field: "status",
            label: "Status",
            options: opts(["active", "archived"]),
        },
        {
            field: "type",
            label: "Nutzung",
            options: opts(["residential", "commercial", "mixed"]),
        },
    ],
    deletionCheck: true,
    actions: [
        new BulkEditAction(),
        new InspectPropertyAction(),
        new PropertyReportAction(),
        new EditAction(),
        new CloneAction(true),
        new ArchiveAction(),
        new DeleteAction(),
    ],
    relations: [
        {
            resource: "units",
            label: "Einheiten",
            field: "property_id",
            countRelation: "units",
            description:
                "Wohnungen, Gewerbe, Garagen und Stellplätze direkt verwalten.",
        },
    ],
};

import { CloneAction } from "@/modules/properties/clone-action";

import { ArchiveAction } from "@/modules/properties/archive-action";
