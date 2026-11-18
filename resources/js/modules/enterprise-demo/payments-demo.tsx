import type { EnterpriseModuleConfig } from "@/framework/tables/enterprise-types";
import {
    createDemoPayments,
    demoAsOfLabel,
    euro,
    number,
    outstandingCents,
    paymentTotals,
    simulatePayment,
    type DemoPayment,
} from "./demo-data";
import { demoQuery } from "./demo-shared";
import { financeDemoConfig, PaymentDetail } from "./finance-demo";

/** The open-item scope also applies after a payment and before filters or exports. */
export const paymentsDemoConfig: EnterpriseModuleConfig<DemoPayment> = {
    id: "open-items",
    title: "Offene Posten",
    description: `Offene und teilweise beglichene Mietforderungen · Stichtag ${demoAsOfLabel}`,
    itemLabel: "offene Posten",
    rows: createDemoPayments(),
    scope: (row) => outstandingCents(row) > 0,
    defaultQuery: demoQuery("partner", "contains", ""),
    defaultSorting: [{ id: "dueDate", desc: false }],
    searchText: financeDemoConfig.searchText,
    columns: financeDemoConfig.columns.filter((column) =>
        [
            "reference",
            "partner",
            "dueDate",
            "status",
            "outstanding",
            "manager",
            "period",
            "method",
            "category",
        ].includes(column.id),
    ),
    filters: financeDemoConfig.filters
        .filter((field) => !["amount", "paid"].includes(field.id))
        .map((field) =>
            field.id === "status"
                ? {
                      ...field,
                      options: ["Offen", "Überfällig", "Teilbezahlt"].map(
                          (value) => ({ value, label: value }),
                      ),
                  }
                : field,
        ),
    groups: [],
    views: [],
    metrics: (rows) => {
        const totals = paymentTotals(rows);
        return [
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
                id: "upcoming",
                label: "Noch nicht überfällig",
                value: euro(
                    (totals.outstandingCents - totals.overdueCents) / 100,
                ),
                hint: "Heute oder später fällige offene Beträge",
            },
            {
                id: "open-count",
                label: "Offene Posten",
                value: number(totals.openCount),
                hint: "Forderungen mit positivem Restbetrag",
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
                `Zahlung für ${count} Posten simuliert. Die ausgeglichenen Posten wurden aus der OP-Liste entfernt.`,
        },
    ],
};
