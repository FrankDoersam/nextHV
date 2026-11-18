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
import { ArchiveAction } from "./archive-action";
import { CloneAction } from "./clone-action";
import { InspectPropertyAction, PropertyReportAction } from "./inspect-action";
import { PropertyNameActions } from "./name-actions";

export const properties: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "Stammdaten, Verwaltung und Einheiten eines Objekts.",
    icon: Building2,
    navigationGroup: "Stammdaten",
    titleField: "name",
    collection: {
        rowSelection: false,
        searchable: true,
        filterable: true,
        groupable: false,
        toolbarFilters: [],
        exportable: false,
        importable: false,
        refreshable: false,
    },
    editor: {
        sectionStyle: "plain",
        tabs: [
            {
                id: "general",
                label: "Stammdaten",
                groups: ["general", "address"],
            },
            {
                id: "management",
                label: "Verwaltung",
                groups: ["management"],
            },
            { id: "building", label: "Gebäude", groups: ["details"] },
            { id: "units", label: "Einheiten", relations: true },
        ],
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
        { ...col("code", "Objekt-Nr."), size: 128, minSize: 112 },
        {
            ...col("name", "Objekt"),
            size: 220,
            minSize: 180,
            grow: 1,
            hideable: false,
        },
        {
            ...col("management_type", "Verwaltungsart"),
            size: 160,
            minSize: 144,
        },
        { ...col("type", "Nutzung"), size: 116, minSize: 104 },
        { ...col("street", "Straße"), size: 180, minSize: 144 },
        { ...col("house_number", "Hausnr."), size: 96, minSize: 88 },
        { ...col("postal_code", "PLZ"), size: 88, minSize: 80 },
        { ...col("city", "Ort"), size: 144, minSize: 120 },
        {
            ...col("units_count", "Einheiten", "number"),
            size: 108,
            minSize: 96,
            sortable: false,
            filter: {
                field: "unit_count",
                operators: ["=", "!=", ">", ">=", "<", "<="],
            },
        },
        { ...col("status", "Status", "badge"), size: 116, minSize: 104 },
        {
            ...col("manager_name", "Ansprechpartner"),
            size: 200,
            minSize: 168,
            defaultVisible: false,
        },
        {
            ...col("manager_email", "E-Mail"),
            size: 240,
            minSize: 200,
            defaultVisible: false,
        },
        {
            ...col("manager_phone", "Telefon"),
            size: 168,
            minSize: 144,
            defaultVisible: false,
        },
        {
            ...col("country", "Land (ISO)"),
            size: 116,
            minSize: 104,
            defaultVisible: false,
        },
        {
            ...col("management_started_on", "Verwaltungsbeginn", "date"),
            size: 176,
            minSize: 160,
            defaultVisible: false,
        },
        {
            ...col("next_inspection_on", "Nächste Objektprüfung", "date"),
            size: 192,
            minSize: 176,
            defaultVisible: false,
        },
        {
            ...col("land_area", "Grundstücksfläche · m²", "number"),
            size: 200,
            minSize: 176,
            defaultVisible: false,
        },
        {
            ...col("construction_year", "Baujahr"),
            size: 104,
            minSize: 96,
            defaultVisible: false,
        },
        {
            ...col("heating_type", "Heizung"),
            size: 160,
            minSize: 136,
            defaultVisible: false,
        },
        {
            ...col("energy_class", "Energieklasse"),
            size: 144,
            minSize: 128,
            defaultVisible: false,
        },
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
        {
            field: "management_type",
            label: "Verwaltungsart",
        },
    ],
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
