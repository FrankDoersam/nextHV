import type { ResourceDefinition } from "@/framework/types";
import {
    col,
    crud,
    currency,
    dateField,
    numeric,
    relation,
    text,
} from "@/modules/fields";
import { WalletCards } from "lucide-react";
export const conditions: ResourceDefinition = {
    name: "rent-conditions",
    label: "Konditionen",
    singular: "Kondition",
    description:
        "Zeitliche Fortschreibung: ältere Konditionen bleiben erhalten, der neueste gültige Stichtag wird verwendet.",
    icon: WalletCards,
    navigationGroup: "Vermietung",
    titleField: "effective_from",
    navigation: false,
    fields: [
        {
            ...relation("contract_id", "Vertrag", "contracts"),
            readonlyOnEdit: true,
        },
        dateField("effective_from", "Gültig ab", "general", true),
        { ...currency("base_rent", "Grundmiete", "general"), required: true },
        currency("service_charge", "Nebenkosten", "general"),
        currency("heating_cost", "Heizkosten", "general"),
        { ...numeric("vat_rate", "Umsatzsteuer · %"), max: 100 },
        text("reason", "Anlass"),
    ],
    columns: [
        {
            field: "monthly_total",
            label: "Monatlich brutto",
            kind: "currency",
            sortable: false,
        },
        col("effective_from", "Gültig ab", "date"),
        col("base_rent", "Grundmiete", "currency"),
        col("service_charge", "Nebenkosten", "currency"),
        col("heating_cost", "Heizkosten", "currency"),
        col("vat_rate", "USt. %", "number"),
        col("reason", "Anlass"),
    ],
    actions: crud(),
};
