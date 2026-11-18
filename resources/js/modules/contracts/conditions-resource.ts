import { money } from "@/lib/format";
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
import { rentScenarioColumns } from "./rent-scenario-columns";
export const conditions: ResourceDefinition = {
    name: "rent-conditions",
    label: "Konditionen",
    singular: "Kondition",
    description:
        "Konditionshistorie mit Mietvorschau pro Zeile. Die Vorschau verändert keine Vertragskonditionen; Mehrertrag zählt volle Monate ab dem Anpassungsdatum.",
    icon: WalletCards,
    navigationGroup: "Vermietung",
    titleField: "effective_from",
    navigation: false,
    collection: {
        renderer: "grid",
        infiniteScroll: true,
        pagination: { mode: "server", pageSize: 25 },
        previewColumns: rentScenarioColumns,
        groupable: false,
        sorters: { initial: [{ id: "effective_from", desc: true }] },
        rowSelection: false,
    },
    includes: [{ relation: "contract" }],
    editor: {
        summary: {
            title: "Monatliche Kondition",
            items: (values) => {
                const net =
                    Number(values.base_rent ?? 0) +
                    Number(values.service_charge ?? 0) +
                    Number(values.heating_cost ?? 0);
                const vat = (net * Number(values.vat_rate ?? 0)) / 100;
                return [
                    {
                        id: "base",
                        label: "Grundmiete",
                        value: money(values.base_rent),
                    },
                    {
                        id: "charges",
                        label: "Neben- & Heizkosten",
                        value: money(
                            Number(values.service_charge ?? 0) +
                                Number(values.heating_cost ?? 0),
                        ),
                    },
                    {
                        id: "vat",
                        label: `Umsatzsteuer (${values.vat_rate ?? 0} %)`,
                        value: money(vat),
                    },
                    {
                        id: "total",
                        label: "Monatlich brutto",
                        value: money(net + vat),
                        emphasis: true,
                        separator: true,
                    },
                ];
            },
        },
    },
    fields: [
        {
            ...relation("contract_id", "Vertrag"),
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
            field: "contract.code",
            label: "Vertrag",
            entity: { id: "contracts", label: "Verträge" },
            reference: { resource: "contracts", idField: "contract_id" },
            size: 160,
            hideable: false,
        },
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
