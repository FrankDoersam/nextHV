import { DeleteAction, EditAction } from "@/framework/actions";
import type { ResourceDefinition } from "@/framework/types";
import { ConfirmTerminationAction } from "@/modules/contracts/confirm-termination-action";
import {
    col,
    dateField,
    notes,
    relation,
    select,
    text,
} from "@/modules/fields";
import { FileX2 } from "lucide-react";
export const terminations: ResourceDefinition = {
    name: "termination-notices",
    label: "Kündigungen",
    singular: "Kündigung",
    description:
        "Eingang dokumentieren. Die Bestätigung setzt erst nach ausdrücklicher Bestätigung das Vertragsende.",
    icon: FileX2,
    navigationGroup: "Vermietung",
    titleField: "reason",
    fields: [
        {
            ...relation("contract_id", "Vertrag"),
            readonlyOnEdit: true,
        },
        {
            ...select("type", "Art"),
        },
        {
            ...select("initiated_by", "Erklärt durch"),
        },
        dateField("declared_on", "Erklärt am", "general", true),
        dateField("received_on", "Eingegangen am", "general", true),
        dateField("requested_end_on", "Gewünschtes Ende", "general", true),
        {
            ...select("delivery_method", "Eingangsweg"),
        },
        text("reason", "Kündigungsgrund", "general", true),
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
        col("received_on", "Eingang", "date"),
        col("requested_end_on", "Gewünschtes Ende", "date"),
        col("confirmed_end_on", "Bestätigtes Ende", "date"),
        col("reason", "Grund"),
        {
            ...col("status", "Status", "badge"),
            filter: {
                kind: "choice",
            },
        },
    ],
    includes: [{ relation: "contract" }],
    actions: [
        new EditAction(),
        new ConfirmTerminationAction(),
        new DeleteAction(),
    ],
};
