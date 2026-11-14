import { PropertyNameActions } from "./name-actions";
import { InspectPropertyAction, PropertyReportAction } from "./inspect-action";
import { DeleteAction, EditAction } from "@/framework/actions";
import type { ResourceDefinition } from "@/framework/types";
import {
    code,
    col,
    dateField,
    notes,
    numeric,
    select,
    text,
} from "@/modules/fields";
import { Building2, CircleCheck, DoorOpen, Ruler } from "lucide-react";
export const properties: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "Stammdaten, Verwaltung und Einheiten eines Objekts.",
    icon: Building2,
    navigationGroup: "Stammdaten",
    titleField: "name",
    supportsClone: true,
    editor: {
        sectionStyle: "collapsible",
        summary: {
            title: "Objektübersicht",
            items: (values) => [
                {
                    id: "name",
                    label: "Objekt",
                    value: String(values.name || "Noch ohne Bezeichnung"),
                    emphasis: true,
                },
                {
                    id: "code",
                    label: "Nummer",
                    value: String(values.code || "—"),
                },
                { id: "city", label: "Ort", value: String(values.city || "—") },
            ],
        },
    },
    summary: {
        metric: "summary",
        items: [
            {
                key: "total",
                label: "Objekte",
                icon: Building2,
                description: "Gesamte gefilterte Auswahl",
            },
            { key: "active", label: "Aktiv", icon: CircleCheck },
            { key: "units", label: "Einheiten", icon: DoorOpen },
            {
                key: "area",
                label: "Grundstücksfläche",
                suffix: "m²",
                icon: Ruler,
            },
        ],
    },
    bulkActions: ["delete"],
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
        select("type", "Nutzung"),
        select("management_type", "Verwaltungsart"),
        select("status", "Status"),
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
            ...select("energy_class", "Energieklasse", "details"),
            required: false,
            nullable: true,
            default: null,
        },
        notes,
    ],
    columns: [
        col("code", "Nr."),
        {
            ...col("name", "Objekt"),
            cell: { type: "icon-text", icon: Building2 },
        },
        { field: "full_address", label: "Adresse", sortable: false },
        col("type", "Nutzung", "badge"),
        {
            ...col("units_count", "Einheiten", "number"),
            sortable: false,
            filter: {
                field: "unit_count",
                operators: ["=", "!=", ">", ">=", "<", "<="],
            },
        },
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
        },
        {
            field: "type",
            label: "Nutzung",
        },
    ],
    deletionCheck: true,
    actions: [
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
