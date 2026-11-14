import type { ResourceDefinition } from "@/framework/types";
import { col, crud, relation, select } from "@/modules/fields";
import { ContactRound } from "lucide-react";
export const parties: ResourceDefinition = {
    name: "contract-parties",
    label: "Vertragsbeteiligte",
    singular: "Vertragsbeteiligter",
    description:
        "Mieter, Vermieter und Bürgen gehören als eigene Relation zum Vertrag.",
    icon: ContactRound,
    titleField: "id",
    navigation: false,
    fields: [
        {
            ...relation("contract_id", "Vertrag", "contracts"),
            readonlyOnEdit: true,
        },
        relation(
            "business_partner_id",
            "Geschäftspartner",
            "business-partners",
        ),
        select("role", "Rolle", ["tenant", "owner", "guarantor"]),
        {
            name: "is_primary",
            label: "Hauptansprechpartner",
            kind: "checkbox",
            default: false,
        },
    ],
    columns: [
        {
            field: "business_partner.display_name",
            label: "Geschäftspartner",
            sortable: false,
            render: (r) =>
                String(
                    (r.business_partner as Record<string, unknown>)
                        ?.display_name ?? "—",
                ),
        },
        {
            field: "contract.code",
            label: "Vertrag",
            sortable: false,
            render: (r) =>
                String((r.contract as Record<string, unknown>)?.code ?? "—"),
        },
        col("role", "Rolle", "badge"),
    ],
    includes: [{ relation: "businessPartner" }, { relation: "contract" }],
    actions: crud(),
};
