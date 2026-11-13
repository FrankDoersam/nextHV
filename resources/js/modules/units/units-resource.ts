import { DeleteAction, EditAction } from "@/framework/actions";
import type { ResourceDefinition } from "@/framework/types";
import {
    code,
    col,
    notes,
    numeric,
    opts,
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
    titleField: "name",
    supportsClone: true,
    groups: [
        { id: "general", label: "Einheit" },
        { id: "details", label: "Ausstattung" },
    ],
    fields: [
        code,
        text("name", "Bezeichnung", "general", true),
        {
            ...relation("property_id", "Objekt", "properties"),
            filters: [{ field: "status", value: "active" }],
        },
        select("type", "Einheitenart", [
            "apartment",
            "commercial",
            "garage",
            "parking",
            "storage",
        ]),
        select("status", "Zustand", ["ready", "maintenance"]),
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
            sortable: false,
            render: (r) =>
                String((r.property as Record<string, unknown>)?.name ?? "—"),
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
            options: opts([
                "apartment",
                "commercial",
                "garage",
                "parking",
                "storage",
            ]),
        },
    ],
    actions: [new EditAction(), new CloneAction(), new DeleteAction()],
    relations: [
        { resource: "contracts", label: "Vertragshistorie", field: "unit_id" },
    ],
};

import { CloneAction } from "@/modules/properties/clone-action";
