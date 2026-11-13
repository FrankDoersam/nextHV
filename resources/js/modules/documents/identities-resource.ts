import type { ResourceDefinition } from "@/framework/types";
import { col, crud, dateField, relation, select, text } from "@/modules/fields";
import { IdCard } from "lucide-react";
export const identities: ResourceDefinition = {
    name: "identity-documents",
    label: "Ausweise & Nachweise",
    singular: "Ausweis",
    description:
        "Mehrere Nachweise pro Geschäftspartner. Nummern und Dateien werden verschlüsselt gespeichert.",
    icon: IdCard,
    titleField: "title",
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
        text("title", "Bezeichnung", "general", true),
        select("type", "Dokumentart", [
            "identity_card",
            "passport",
            "residence_permit",
            "other",
        ]),
        {
            ...text("document_number", "Ausweisnummer"),
            writeOnly: true,
            description:
                "Wird nur beim Schreiben übertragen. Sichtbar bleiben die letzten vier Zeichen.",
        },
        {
            ...text("issuing_country", "Ausstellungsland (ISO)"),
            default: "DE",
            maxLength: 2,
        },
        dateField("expires_on", "Gültig bis"),
        dateField("verified_on", "Geprüft am"),
    ],
    columns: [
        col("title", "Nachweis"),
        col("type", "Art", "badge"),
        col("number_last_four", "Nummer · letzte 4"),
        col("expires_on", "Gültig bis", "date"),
        col("verified_on", "Geprüft am", "date"),
    ],
    actions: crud(),
};
