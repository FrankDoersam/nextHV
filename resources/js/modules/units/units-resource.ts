import { DeleteAction, EditAction } from "@/framework/actions";
import type { ResourceDefinition } from "@/framework/types";
import {
    code,
    col,
    notes,
    numeric,
    relation,
    select,
    text,
} from "@/modules/fields";
import { DoorOpen } from "lucide-react";
export const units: ResourceDefinition = {
    name: "units",
    label: "Einheiten",
    singular: "Einheit",
    description:
        "Physische Einheit. Mietdaten und Kaution werden über Verträge verwaltet.",
    icon: DoorOpen,
    navigationGroup: "Stammdaten",
    titleField: "name",
    supportsClone: true,
    bulkActions: ["delete"],
    editor: { sectionStyle: "collapsible" },
    view: { sectionStyle: "collapsible" },
    collection: { viewMode: "sheet" },
    views: [
        { id: "all", label: "Alle", count: true },
        {
            id: "ready",
            label: "Nutzbar",
            filters: [{ field: "status", value: "ready" }],
            count: true,
        },
        {
            id: "maintenance",
            label: "Instandhaltung",
            filters: [{ field: "status", value: "maintenance" }],
            count: true,
        },
    ],
    groups: [
        { id: "general", label: "Einheit" },
        { id: "details", label: "Ausstattung", defaultOpen: false },
    ],
    fields: [
        code,
        text("name", "Bezeichnung", "general", true),
        {
            ...relation("property_id", "Objekt"),
        },
        select("type", "Einheitenart"),
        select("status", "Zustand"),
        { ...text("floor", "Etage"), maxLength: 30 },
        numeric("area", "Fläche · m²"),
        numeric("rooms", "Zimmer"),
        {
            name: "has_balcony",
            label: "Balkon",
            kind: "checkbox",
            group: "details",
            default: false,
        },
        {
            name: "barrier_free",
            label: "Barrierefrei",
            kind: "checkbox",
            group: "details",
            default: false,
        },
        notes,
    ],
    columns: [
        col("code", "Nr."),
        col("name", "Einheit"),
        {
            field: "property.name",
            label: "Objekt",
            sortable: true,
        },
        col("type", "Art", "badge"),
        col("area", "m²", "number"),
        col("status", "Zustand", "badge"),
    ],
    includes: [{ relation: "property" }],
    groupBy: [
        { value: "type", label: "Art" },
        { value: "status", label: "Zustand" },
    ],
    filters: [
        {
            field: "type",
            label: "Art",
        },
    ],
    actions: [new EditAction(), new CloneAction(), new DeleteAction()],
    relations: [
        { resource: "contracts", label: "Vertragshistorie", field: "unit_id" },
    ],
};

import { CloneAction } from "@/modules/properties/clone-action";
