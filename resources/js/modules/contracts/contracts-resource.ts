import { DeleteAction, EditAction } from "@/framework/actions";
import type { ResourceDefinition } from "@/framework/types";
import {
    code,
    col,
    currency,
    dateField,
    notes,
    numeric,
    opts,
    relation,
    select,
} from "@/modules/fields";
import { FileText } from "lucide-react";
export const contracts: ResourceDefinition = {
    name: "contracts",
    label: "Verträge",
    singular: "Vertrag",
    description:
        "Entwurf anlegen, Mieter zuordnen und Konditionen erfassen. Anschließend aktivieren.",
    icon: FileText,
    titleField: "code",
    groups: [
        { id: "general", label: "Vertragsgrundlagen" },
        { id: "term", label: "Laufzeit & Kündigung" },
        { id: "finance", label: "Zahlung & Kaution" },
        { id: "details", label: "Hinweise" },
    ],
    fields: [
        code,
        relation("unit_id", "Einheit", "units"),
        select("type", "Vertragsart", [
            "residential_lease",
            "commercial_lease",
            "garage_lease",
            "parking_lease",
            "storage_lease",
        ]),
        dateField("signed_on", "Unterzeichnet am", "term"),
        dateField("starts_on", "Vertragsbeginn", "term", true),
        dateField("ends_on", "Befristetes Ende", "term"),
        dateField("minimum_term_until", "Mindestlaufzeit bis", "term"),
        {
            ...numeric(
                "notice_period_months",
                "Kündigungsfrist · Monate",
                "term",
                3,
            ),
            max: 120,
        },
        {
            ...select(
                "notice_to",
                "Kündigung zum",
                ["month_end", "quarter_end", "year_end", "any"],
                "term",
            ),
            options: [
                { value: "month_end", label: "Monatsende" },
                { value: "quarter_end", label: "Quartalsende" },
                { value: "year_end", label: "Jahresende" },
                { value: "any", label: "Beliebiger Tag" },
            ],
        },
        {
            ...numeric(
                "payment_day",
                "Fälligkeit · Tag im Monat",
                "finance",
                3,
            ),
            min: 1,
            max: 28,
        },
        currency("deposit", "Kaution"),
        select(
            "deposit_status",
            "Kautionsstatus",
            ["outstanding", "partial", "received", "returned"],
            "finance",
        ),
        notes,
    ],
    columns: [
        col("code", "Vertrag"),
        {
            field: "unit.name",
            label: "Einheit",
            sortable: false,
            render: (r) =>
                String((r.unit as Record<string, unknown>)?.name ?? "—"),
        },
        col("type", "Art", "badge"),
        col("starts_on", "Beginn", "date"),
        col("ends_on", "Ende", "date"),
        col("status", "Status", "badge"),
    ],
    includes: [{ relation: "unit" }],
    aggregates: [
        { relation: "parties", type: "count" },
        { relation: "conditions", type: "count" },
        { relation: "terminations", type: "count" },
        { relation: "links", type: "count" },
        { relation: "incomingLinks", type: "count" },
    ],
    groupBy: [
        { value: "status", label: "Status" },
        { value: "type", label: "Vertragsart" },
    ],
    filters: [
        {
            field: "status",
            label: "Status",
            options: opts(["draft", "active", "ended"]),
        },
    ],
    actions: [
        new EditAction(),
        new ActivateContractAction(),
        new DeleteAction(),
    ],
    relations: [
        {
            resource: "contract-parties",
            countRelation: "parties",
            label: "Vertragsbeteiligte",
            field: "contract_id",
        },
        {
            resource: "rent-conditions",
            countRelation: "conditions",
            label: "Konditionen",
            field: "contract_id",
            description:
                "Jeder Stichtag gilt bis zum Beginn des nächsten Konditionsstands.",
        },
        {
            resource: "termination-notices",
            countRelation: "terminations",
            label: "Kündigungen",
            field: "contract_id",
        },
        {
            resource: "contract-links",
            countRelation: "links",
            label: "Verknüpfte Verträge",
            field: "contract_id",
        },
    ],
};

import { ActivateContractAction } from "@/modules/contracts/activate-contract-action";
