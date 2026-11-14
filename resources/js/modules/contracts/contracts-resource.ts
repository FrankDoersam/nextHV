import { DeleteAction, EditAction } from "@/framework/actions";
import type { ResourceDefinition } from "@/framework/types";
import {
    code,
    col,
    currency,
    dateField,
    notes,
    numeric,
    relation,
    select,
} from "@/modules/fields";
import { date, label, money } from "@/lib/format";
import { FileText, CircleCheck, FilePenLine, Wallet } from "lucide-react";
export const contracts: ResourceDefinition = {
    name: "contracts",
    label: "Verträge",
    singular: "Vertrag",
    description:
        "Entwurf anlegen, Mieter zuordnen und Konditionen erfassen. Anschließend aktivieren.",
    icon: FileText,
    navigationGroup: "Vermietung",
    titleField: "code",
    bulkActions: ["delete"],
    createFlow: "new-contract",
    views: [
        { id: "all", label: "Alle", count: true },
        {
            id: "active",
            label: "Aktiv",
            filters: [{ field: "status", value: "active" }],
            count: true,
        },
        {
            id: "draft",
            label: "Entwürfe",
            filters: [{ field: "status", value: "draft" }],
            count: true,
        },
        {
            id: "ended",
            label: "Beendet",
            filters: [{ field: "status", value: "ended" }],
            count: true,
        },
    ],
    summary: {
        metric: "summary",
        items: [
            {
                key: "total",
                label: "Verträge",
                icon: FileText,
                description: "Gesamte gefilterte Auswahl",
            },
            { key: "active", label: "Aktiv", icon: CircleCheck },
            { key: "draft", label: "Entwürfe", icon: FilePenLine },
            {
                key: "deposits",
                label: "Vereinbarte Kaution",
                kind: "currency",
                icon: Wallet,
            },
        ],
    },
    editor: {
        wizardSummary: {
            title: "Vertragsübersicht",
            items: (values) => [
                {
                    id: "code",
                    label: "Vertrag",
                    value: String(values.code || "Neuer Entwurf"),
                    emphasis: true,
                },
                { id: "type", label: "Art", value: label(values.type) },
                {
                    id: "starts_on",
                    label: "Beginn",
                    value: date(values.starts_on),
                },
                {
                    id: "deposit",
                    label: "Kaution",
                    value: money(values.deposit),
                    separator: true,
                },
            ],
        },
        sectionStyle: "card",
        tabs: [
            { id: "general", label: "Grunddaten", groups: ["general", "term"] },
            {
                id: "finance",
                label: "Zahlung",
                groups: ["finance"],
                summary: {
                    title: "Zahlungsvereinbarung",
                    variant: "framed",
                    items: (values) => [
                        {
                            id: "day",
                            label: "Monatliche Fälligkeit",
                            value: values.payment_day
                                ? `Am ${values.payment_day}. des Monats`
                                : "—",
                        },
                        {
                            id: "status",
                            label: "Kautionsstatus",
                            value: label(values.deposit_status),
                        },
                        {
                            id: "deposit",
                            label: "Vereinbarte Kaution",
                            value: money(values.deposit),
                            emphasis: true,
                            separator: true,
                        },
                    ],
                },
            },
            { id: "details", label: "Hinweise", groups: ["details"] },
            { id: "relations", label: "Beziehungen", relations: true },
        ],
    },
    groups: [
        { id: "general", label: "Vertragsgrundlagen" },
        { id: "term", label: "Laufzeit & Kündigung" },
        { id: "finance", label: "Zahlung & Kaution" },
        { id: "details", label: "Hinweise" },
    ],
    fields: [
        code,
        { ...relation("unit_id", "Einheit"), selectedDisplay: "title" },
        select("type", "Vertragsart"),
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
            ...select("notice_to", "Kündigung zum", "term"),
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
        select("deposit_status", "Kautionsstatus", "finance"),
        notes,
    ],
    columns: [
        { ...col("code", "Vertrag"), hideable: false },
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
        {
            ...col("signed_on", "Unterzeichnet am", "date"),
            defaultVisible: false,
        },
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
        { field: "unit.name", label: "Einheit · Name", kind: "text" },
        {
            field: "status",
            label: "Status",
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
            collection: {
                pagination: false,
                rowSelection: false,
                detailLink: false,
            },
            editorCollection: {
                searchable: false,
                filterable: false,
                groupable: false,
                columnChooser: false,
                exportable: false,
                refreshable: false,
            },
            createForm: { binding: "locked" },
            editForm: { binding: "locked" },
        },
        {
            resource: "rent-conditions",
            countRelation: "conditions",
            label: "Konditionen",
            field: "contract_id",
            collection: {
                pagination: false,
                rowSelection: false,
                detailLink: false,
            },
            editorCollection: {
                searchable: false,
                filterable: false,
                groupable: false,
                columnChooser: false,
                exportable: false,
                refreshable: false,
            },
            createForm: { binding: "locked" },
            editForm: { binding: "locked" },
            description:
                "Jeder Stichtag gilt bis zum Beginn des nächsten Konditionsstands.",
        },
        {
            resource: "termination-notices",
            countRelation: "terminations",
            label: "Kündigungen",
            field: "contract_id",
            collection: {
                pagination: false,
                rowSelection: false,
                detailLink: false,
            },
            editorCollection: {
                searchable: false,
                filterable: false,
                groupable: false,
                columnChooser: false,
                exportable: false,
                refreshable: false,
            },
            createForm: { binding: "locked" },
            editForm: { binding: "locked" },
        },
        {
            resource: "contract-links",
            countRelation: "links",
            label: "Verknüpfte Verträge",
            field: "contract_id",
            collection: {
                pagination: false,
                rowSelection: false,
                detailLink: false,
            },
            editorCollection: {
                searchable: false,
                filterable: false,
                groupable: false,
                columnChooser: false,
                exportable: false,
                refreshable: false,
            },
            createForm: { binding: "locked" },
            editForm: { binding: "locked" },
        },
    ],
};

import { ActivateContractAction } from "@/modules/contracts/activate-contract-action";
