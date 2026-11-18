import { ArrowDownLeft, Check, FileText } from "lucide-react";
import {
    EnterpriseAmountCell,
    EnterpriseDateCell,
    EnterpriseEntityCell,
    EnterprisePersonCell,
    EnterpriseProgressCell,
    EnterpriseStatusCell,
} from "@/components/blocks/enterprise-cells";
import { Badge } from "@/components/reui/badge";
import type {
    EnterpriseModuleConfig,
    EnterpriseTone,
} from "@/framework/tables/enterprise-types";
import {
    createDemoPayments,
    demoAsOf,
    demoAsOfLabel,
    demoProperties,
    euro,
    number,
    outstandingCents,
    overdueDays,
    paidCents,
    paymentProgress,
    paymentStatus,
    paymentTotals,
    simulatePayment,
    type DemoPayment,
    type PaymentStatus,
} from "./demo-data";
import { DemoDetailField, DemoDetailSection, demoQuery } from "./demo-shared";

const statusTone: Record<PaymentStatus, EnterpriseTone> = {
    Offen: "info",
    Überfällig: "danger",
    Teilbezahlt: "warning",
    Ausgeglichen: "success",
};
const options = (values: readonly string[]) =>
    values.map((value) => ({ value, label: value }));

function PaymentDetail({ row }: { row: DemoPayment }) {
    const days = overdueDays(row);
    const remaining = outstandingCents(row);
    const status = paymentStatus(row);
    return (
        <div className="flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-2">
                <EnterpriseStatusCell
                    label={status}
                    tone={statusTone[status]}
                />
                <Badge variant="outline">{row.category}</Badge>
                <Badge variant="secondary">{row.period}</Badge>
            </div>
            <DemoDetailSection title="Forderung & Zuordnung">
                <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
                    <DemoDetailField label="Mietpartei">
                        <EnterprisePersonCell name={row.partner} />
                    </DemoDetailField>
                    <DemoDetailField label="Objekt">
                        {row.propertyName} · {row.city}
                    </DemoDetailField>
                    <DemoDetailField label="Einheit">
                        {row.unitLabel}
                    </DemoDetailField>
                    <DemoDetailField label="Belegnummer">
                        {row.reference}
                    </DemoDetailField>
                    <DemoDetailField label="Fällig am">
                        <EnterpriseDateCell
                            date={row.dueDate}
                            overdue={days > 0}
                        />
                    </DemoDetailField>
                    <DemoDetailField label="Zahlungsart">
                        {row.method}
                    </DemoDetailField>
                </dl>
            </DemoDetailSection>
            <DemoDetailSection title="Zahlungsstand">
                <dl className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/20 p-4">
                    <DemoDetailField label="Soll">
                        <EnterpriseAmountCell value={row.amountCents / 100} />
                    </DemoDetailField>
                    <DemoDetailField label="Gezahlt">
                        <EnterpriseAmountCell
                            value={paidCents(row) / 100}
                            tone="success"
                        />
                    </DemoDetailField>
                    <DemoDetailField label="Offener Betrag">
                        <EnterpriseAmountCell
                            value={remaining / 100}
                            tone={
                                days > 0
                                    ? "danger"
                                    : remaining > 0
                                      ? "warning"
                                      : "success"
                            }
                        />
                    </DemoDetailField>
                    <DemoDetailField label="Zahlungsquote">
                        <EnterpriseProgressCell
                            value={paymentProgress(row)}
                            variant="ring"
                            tone={remaining > 0 ? "warning" : "success"}
                        />
                    </DemoDetailField>
                </dl>
                {days > 0 && (
                    <p className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                        {days} Tage überfällig zum {demoAsOfLabel}. Ausstehend:{" "}
                        {euro(remaining / 100)}.
                    </p>
                )}
            </DemoDetailSection>
            <DemoDetailSection title="Zahlungshistorie">
                <ol className="flex flex-col gap-4">
                    <li className="flex items-start gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted">
                            <FileText className="size-3.5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">
                                    Forderung angelegt
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {row.period} · {row.category}
                                </p>
                            </div>
                            <EnterpriseAmountCell
                                value={row.amountCents / 100}
                                secondary={(row.dueDate > demoAsOf
                                    ? demoAsOf
                                    : `${row.dueDate.slice(0, 7)}-01`
                                )
                                    .split("-")
                                    .reverse()
                                    .join(".")}
                            />
                        </div>
                    </li>
                    {row.payments.map((entry) => (
                        <li key={entry.id} className="flex items-start gap-3">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                                <ArrowDownLeft
                                    className="size-3.5"
                                    aria-hidden="true"
                                />
                            </span>
                            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">
                                        {entry.label}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {entry.id} · {row.method}
                                    </p>
                                </div>
                                <EnterpriseAmountCell
                                    value={entry.amountCents / 100}
                                    secondary={entry.date
                                        .split("-")
                                        .reverse()
                                        .join(".")}
                                    tone="success"
                                />
                            </div>
                        </li>
                    ))}
                    {!row.payments.length && (
                        <li className="pl-10 text-xs text-muted-foreground">
                            Bisher kein Zahlungseingang zugeordnet.
                        </li>
                    )}
                    {remaining === 0 && (
                        <li className="flex items-center gap-2 pl-10 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <Check className="size-3.5" aria-hidden="true" />
                            Posten vollständig ausgeglichen
                        </li>
                    )}
                </ol>
            </DemoDetailSection>
            <DemoDetailSection title="Verantwortlich">
                <EnterprisePersonCell
                    name={row.manager}
                    subtitle="Mietenbuchhaltung · Demo-Team"
                />
            </DemoDetailSection>
        </div>
    );
}

export const paymentsDemoConfig: EnterpriseModuleConfig<DemoPayment> = {
    id: "payments-open-items",
    title: "Forderungen & Zahlungseingänge",
    description: "Mietforderungen · September–Dezember 2026",
    itemLabel: "Posten",
    rows: createDemoPayments(),
    defaultGroupBy: "property",
    defaultSorting: [{ id: "dueDate", desc: false }],
    searchText: (row) =>
        [
            row.id,
            row.reference,
            row.unitId,
            row.unitLabel,
            row.propertyName,
            row.city,
            row.partner,
            row.manager,
            row.period,
        ].join(" "),
    columns: [
        {
            id: "reference",
            label: "Posten / Beleg",
            width: 255,
            primary: true,
            value: (row) => row.reference,
            render: (row) => (
                <EnterpriseEntityCell
                    title={row.reference}
                    subtitle={`${row.propertyName} · ${row.period}`}
                    icon={<FileText className="size-4" />}
                />
            ),
        },
        {
            id: "partner",
            label: "Mietpartei",
            width: 175,
            value: (row) => row.partner,
            render: (row) => (
                <EnterprisePersonCell
                    name={row.partner}
                    subtitle={row.unitLabel}
                />
            ),
        },
        {
            id: "dueDate",
            label: "Fälligkeit",
            width: 138,
            value: (row) => row.dueDate,
            render: (row) => (
                <div className="flex flex-col gap-1">
                    <EnterpriseDateCell
                        date={row.dueDate}
                        overdue={overdueDays(row) > 0}
                    />
                    {overdueDays(row) > 0 && (
                        <span className="text-[11px] text-destructive">
                            {overdueDays(row)} Tage überfällig
                        </span>
                    )}
                </div>
            ),
        },
        {
            id: "status",
            label: "Status",
            width: 122,
            value: (row) => paymentStatus(row),
            render: (row) => (
                <EnterpriseStatusCell
                    label={paymentStatus(row)}
                    tone={statusTone[paymentStatus(row)]}
                />
            ),
        },
        {
            id: "amount",
            label: "Soll",
            width: 125,
            align: "right",
            value: (row) => row.amountCents / 100,
            render: (row) => (
                <EnterpriseAmountCell value={row.amountCents / 100} />
            ),
            aggregate: (rows) => paymentTotals(rows).amountCents / 100,
            renderAggregate: (value) => <EnterpriseAmountCell value={value} />,
        },
        {
            id: "paid",
            label: "Gezahlt",
            width: 125,
            align: "right",
            value: (row) => paidCents(row) / 100,
            render: (row) => (
                <EnterpriseAmountCell
                    value={paidCents(row) / 100}
                    tone={paidCents(row) > 0 ? "success" : "neutral"}
                />
            ),
            aggregate: (rows) => paymentTotals(rows).paidCents / 100,
            renderAggregate: (value) => (
                <EnterpriseAmountCell value={value} tone="success" />
            ),
        },
        {
            id: "outstanding",
            label: "Offen",
            width: 125,
            align: "right",
            value: (row) => outstandingCents(row) / 100,
            render: (row) => (
                <EnterpriseAmountCell
                    value={outstandingCents(row) / 100}
                    tone={
                        overdueDays(row) > 0
                            ? "danger"
                            : outstandingCents(row) > 0
                              ? "warning"
                              : "neutral"
                    }
                />
            ),
            aggregate: (rows) => paymentTotals(rows).outstandingCents / 100,
            renderAggregate: (value) => (
                <EnterpriseAmountCell
                    value={value}
                    tone={value > 0 ? "warning" : "success"}
                />
            ),
        },
        {
            id: "progress",
            label: "Zahlungsquote",
            width: 115,
            value: paymentProgress,
            render: (row) => (
                <EnterpriseProgressCell
                    value={paymentProgress(row)}
                    label="Zahlungsquote"
                    variant="ring"
                    tone={
                        paymentStatus(row) === "Ausgeglichen"
                            ? "success"
                            : "info"
                    }
                />
            ),
            aggregate: (rows) => paymentTotals(rows).progress,
            renderAggregate: (value) => (
                <EnterpriseProgressCell
                    value={value}
                    label="Zahlungsquote nach Betrag"
                    variant="ring"
                    tone={value === 100 ? "success" : "info"}
                />
            ),
        },
        {
            id: "manager",
            label: "Betreuung",
            width: 160,
            hidden: true,
            value: (row) => row.manager,
            render: (row) => <EnterprisePersonCell name={row.manager} />,
        },
        {
            id: "period",
            label: "Zeitraum",
            width: 140,
            hidden: true,
            value: (row) => row.period,
            render: (row) => <Badge variant="outline">{row.period}</Badge>,
        },
        {
            id: "method",
            label: "Zahlungsart",
            width: 145,
            hidden: true,
            value: (row) => row.method,
            render: (row) => <Badge variant="secondary">{row.method}</Badge>,
        },
        {
            id: "category",
            label: "Forderungsart",
            width: 140,
            hidden: true,
            value: (row) => row.category,
            render: (row) => <Badge variant="outline">{row.category}</Badge>,
        },
    ],
    filters: [
        {
            id: "property",
            label: "Objekt",
            type: "select",
            options: options(demoProperties.map((row) => row.name)),
            getValue: (row) => row.propertyName,
        },
        {
            id: "status",
            label: "Status",
            type: "select",
            options: options([
                "Offen",
                "Überfällig",
                "Teilbezahlt",
                "Ausgeglichen",
            ]),
            getValue: paymentStatus,
        },
        {
            id: "period",
            label: "Zeitraum",
            type: "select",
            options: options([
                "September 2026",
                "Oktober 2026",
                "November 2026",
                "Dezember 2026",
            ]),
            getValue: (row) => row.period,
        },
        {
            id: "manager",
            label: "Betreuung",
            type: "select",
            options: options(["Nora Beispiel", "Jonas Muster", "Mira Test"]),
            getValue: (row) => row.manager,
        },
        {
            id: "partner",
            label: "Mietpartei",
            type: "text",
            getValue: (row) => row.partner,
        },
        {
            id: "method",
            label: "Zahlungsart",
            type: "select",
            options: options(["SEPA-Lastschrift", "Überweisung"]),
            getValue: (row) => row.method,
        },
        {
            id: "amount",
            label: "Soll in €",
            type: "number",
            getValue: (row) => row.amountCents / 100,
        },
        {
            id: "paid",
            label: "Gezahlt in €",
            type: "number",
            getValue: (row) => paidCents(row) / 100,
        },
        {
            id: "outstanding",
            label: "Offen in €",
            type: "number",
            getValue: (row) => outstandingCents(row) / 100,
        },
        {
            id: "overdueDays",
            label: "Verzug in Tagen",
            type: "number",
            getValue: (row) => overdueDays(row),
        },
    ],
    groups: [
        { id: "property", label: "Objekt", value: (row) => row.propertyName },
        { id: "status", label: "Status", value: paymentStatus },
        { id: "partner", label: "Mietpartei", value: (row) => row.partner },
        { id: "period", label: "Zeitraum", value: (row) => row.period },
        { id: "manager", label: "Betreuung", value: (row) => row.manager },
    ],
    views: [
        { id: "all", label: "Alle Posten", groupBy: "property" },
        {
            id: "open",
            label: "Offene Posten",
            query: demoQuery("outstanding", "gt", 0),
            groupBy: "property",
        },
        {
            id: "overdue",
            label: "Überfällig",
            query: demoQuery("overdueDays", "gt", 0),
            groupBy: "property",
        },
        {
            id: "partial",
            label: "Teilbezahlt",
            query: demoQuery("status", "is", "Teilbezahlt"),
            groupBy: "property",
        },
        {
            id: "settled",
            label: "Ausgeglichen",
            query: demoQuery("status", "is", "Ausgeglichen"),
            groupBy: "property",
        },
    ],
    metrics: (rows) => {
        const totals = paymentTotals(rows);
        return [
            {
                id: "receivables",
                label: "Forderungsvolumen",
                value: euro(totals.amountCents / 100),
                hint: `${totals.count} Posten im gewählten Bestand`,
            },
            {
                id: "open",
                label: "Offener Betrag",
                value: euro(totals.outstandingCents / 100),
                hint: `${totals.openCount} offene Posten`,
                tone: totals.openCount ? "warning" : "success",
            },
            {
                id: "overdue",
                label: "Davon überfällig",
                value: euro(totals.overdueCents / 100),
                hint: `${totals.overdueCount} Posten · Stichtag ${demoAsOfLabel}`,
                tone: totals.overdueCount ? "danger" : "success",
            },
            {
                id: "paid",
                label: "Zahlungsquote",
                value: `${number(totals.progress, 1)} %`,
                hint: `${euro(totals.paidCents / 100)} eingegangen`,
                tone: "success",
                progress: totals.progress,
            },
        ];
    },
    detailTitle: (row) => row.reference,
    renderDetail: (row) => <PaymentDetail row={row} />,
    actions: [
        {
            id: "simulate-payment",
            label: "Zahlung simulieren",
            eligible: (row) => outstandingCents(row) > 0,
            apply: simulatePayment,
            successMessage: (count) =>
                `Zahlung für ${count} Posten simuliert. Die Demo-Posten sind ausgeglichen.`,
        },
    ],
};
