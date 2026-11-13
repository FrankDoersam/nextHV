import type { ResourceDefinition } from "@/framework/types";
import { col, crud, relation, select } from "@/modules/fields";
import { Tags } from "lucide-react";
export const roles: ResourceDefinition = {
    name: "partner-roles",
    label: "Partnerrollen",
    singular: "Rolle",
    description: "Ein Geschäftspartner kann mehrere Rollen übernehmen.",
    icon: Tags,
    titleField: "role",
    navigation: false,
    fields: [
        {
            ...relation(
                "business_partner_id",
                "Geschäftspartner",
                "business-partners",
            ),
            readonlyOnEdit: true,
        },
        select("role", "Rolle", [
            "tenant",
            "owner",
            "supplier",
            "caretaker",
            "guarantor",
        ]),
    ],
    columns: [col("role", "Rolle", "badge")],
    actions: crud(),
};
