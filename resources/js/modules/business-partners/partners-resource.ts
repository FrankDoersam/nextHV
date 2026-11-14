import type { ResourceDefinition } from "@/framework/types";
import {
    code,
    col,
    crud,
    dateField,
    notes,
    select,
    text,
} from "@/modules/fields";
import { Users } from "lucide-react";
export const partners: ResourceDefinition = {
    name: "business-partners",
    label: "Geschäftspartner",
    singular: "Geschäftspartner",
    description:
        "Personen und Unternehmen mit Rollen, Vertragsbezügen und separaten Ausweisen.",
    icon: Users,
    navigationGroup: "Stammdaten",
    titleField: "display_name",
    groups: [
        { id: "general", label: "Geschäftspartner" },
        { id: "contact", label: "Kontakt" },
        { id: "details", label: "Weitere Angaben" },
    ],
    fields: [
        code,
        text("display_name", "Anzeigename", "general", true),
        select("kind", "Typ"),
        text("first_name", "Vorname"),
        text("last_name", "Nachname"),
        text("company_name", "Unternehmen"),
        dateField("birth_date", "Geburtsdatum"),
        { ...text("email", "E-Mail", "contact"), kind: "email" },
        text("phone", "Telefon", "contact"),
        text("street", "Straße und Hausnummer", "contact"),
        text("postal_code", "PLZ", "contact"),
        text("city", "Ort", "contact"),
        {
            ...text("country", "Land (ISO)", "contact"),
            default: "DE",
            maxLength: 2,
        },
        text("commercial_register", "Handelsregister", "details"),
        notes,
    ],
    columns: [
        { field: "full_name", label: "Vollständiger Name", sortable: false },
        col("code", "Nr."),
        {
            ...col("display_name", "Geschäftspartner"),
            cell: { type: "avatar", secondary: "email" },
        },
        col("kind", "Typ", "badge"),
        { ...col("email", "E-Mail"), defaultVisible: false },
        col("city", "Ort"),
    ],
    groupBy: [
        { value: "kind", label: "Typ" },
        { value: "city", label: "Ort" },
    ],
    actions: crud(),
    relations: [
        {
            resource: "partner-roles",
            label: "Rollen",
            field: "business_partner_id",
        },
        {
            resource: "contract-parties",
            label: "Vertragsbeteiligungen",
            field: "business_partner_id",
        },
        {
            resource: "identity-documents",
            label: "Ausweise & Nachweise",
            field: "business_partner_id",
        },
    ],
};
