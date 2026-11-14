import type { ResourceDefinition } from "@/framework/types";
import { col, crud, notes, relation, select } from "@/modules/fields";
import { Link2 } from "lucide-react";
export const links: ResourceDefinition = {
    name: "contract-links",
    label: "Vertragsverknüpfungen",
    singular: "Verknüpfung",
    description:
        "Separate Verträge miteinander verbinden, zum Beispiel Wohnung und Garage.",
    icon: Link2,
    titleField: "id",
    navigation: false,
    fields: [
        {
            ...relation("contract_id", "Vertrag"),
            readonlyOnEdit: true,
        },
        relation("related_contract_id", "Verknüpfter Vertrag"),
        {
            ...select("type", "Beziehung"),
        },
        { ...notes, group: "general" },
    ],
    columns: [
        {
            field: "contract.code",
            label: "Vertrag",
            sortable: false,
            render: (r) =>
                String((r.contract as Record<string, unknown>)?.code ?? "—"),
        },
        {
            field: "related_contract.code",
            filter: { field: "relatedContract.code" },
            label: "Verknüpfter Vertrag",
            sortable: false,
            render: (r) =>
                String(
                    (r.related_contract as Record<string, unknown>)?.code ??
                        "—",
                ),
        },
        col("type", "Beziehung", "badge"),
        col("notes", "Notiz"),
    ],
    includes: [{ relation: "contract" }, { relation: "relatedContract" }],
    actions: crud(),
};
