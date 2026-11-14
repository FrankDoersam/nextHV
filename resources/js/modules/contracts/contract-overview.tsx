import { EditableKeyValueList } from "@/framework/forms/editable-key-value-list";
import { Link } from "react-router";
import {
    ArrowUpRight,
    CalendarClock,
    CirclePlus,
    FileX2,
    WalletCards,
    Users,
} from "lucide-react";
import {
    DetailList,
    EmptyState,
    ErrorState,
    Loading,
} from "@/components/blocks/content";
import { Stack } from "@/components/blocks/layout";
import {
    WorkspaceCard,
    WorkspaceColumns,
} from "@/components/blocks/workspace-card";
import { PeopleGroup } from "@/components/blocks/people-avatar";
import { Button } from "@/components/ui/button";
import { useResourceList } from "@/framework/data/hooks";
import { useWorkbench } from "@/framework/workbench";
import type { RecordData } from "@/framework/types";
import { conditions } from "./conditions-resource";
import { parties } from "./parties-resource";
import { contracts } from "./contracts-resource";
import { date, label, money } from "@/lib/format";

export default function ContractOverview({ record }: { record: RecordData }) {
    const workbench = useWorkbench();
    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Berlin",
    }).format(new Date());
    const current = useResourceList(conditions, {
        limit: 10,
        filters: [
            { field: "contract_id", value: record.id },
            { field: "effective_from", operator: "<=", value: today },
        ],
        sort: [{ field: "effective_from", direction: "desc" }],
    });
    const contacts = useResourceList(parties, {
        limit: 10,
        filters: [{ field: "contract_id", value: record.id }],
        sort: [{ field: "is_primary", direction: "desc" }],
    });
    const condition = current.data?.data[0];
    const open = (name: string) =>
        workbench.openRelation(
            contracts.relations!.find((r) => r.resource === name)!,
            { resource: contracts.name, id: record.id },
        );
    const people = (contacts.data?.data ?? []).map((p) => ({
        id: p.id,
        name: String(
            (p.business_partner as RecordData | undefined)?.display_name ??
                "Geschäftspartner",
        ),
    }));
    return (
        <Stack>
            <WorkspaceColumns variant="metrics">
                <ContractMetric
                    title="Monatliche Kondition"
                    value={
                        current.isPending
                            ? "…"
                            : condition
                              ? money(condition.monthly_total)
                              : "—"
                    }
                    description={
                        condition
                            ? `Gültig seit ${date(condition.effective_from)}`
                            : "Keine zum heutigen Datum gültige Kondition"
                    }
                />
                <ContractMetric
                    title="Kaution"
                    value={money(record.deposit)}
                    description={label(record.deposit_status)}
                />
                <ContractMetric
                    title="Vertragsbeginn"
                    value={date(record.starts_on)}
                    description={
                        record.ends_on
                            ? `Endet am ${date(record.ends_on)}`
                            : "Unbefristeter Vertrag"
                    }
                />
                <ContractMetric
                    title="Kündigungsfrist"
                    value={`${record.notice_period_months ?? "—"} Monate`}
                    description={`Zum ${label(record.notice_to)}`}
                />
            </WorkspaceColumns>
            <WorkspaceColumns>
                <WorkspaceCard
                    title="Vertrag & Laufzeit"
                    icon={<CalendarClock />}
                    footer={
                        <span>
                            Stammdaten nach Aktivierung geschützt · Änderungen
                            über die vorgesehenen Vorgänge
                        </span>
                    }
                >
                    <DetailList
                        items={[
                            { label: "Vertragsart", value: label(record.type) },
                            {
                                label: "Einheit",
                                value: (
                                    <Link
                                        to={`/units/${record.unit_id}`}
                                        className="inline-flex items-center gap-1 font-medium hover:underline"
                                    >
                                        {String(
                                            (record.unit as RecordData)?.name ??
                                                `#${record.unit_id}`,
                                        )}
                                        <ArrowUpRight className="size-3" />
                                    </Link>
                                ),
                            },
                            {
                                label: "Unterzeichnet am",
                                value: date(record.signed_on),
                            },
                            {
                                label: "Mindestlaufzeit bis",
                                value: date(record.minimum_term_until),
                            },
                            {
                                label: "Zahlung fällig",
                                value: `Am ${record.payment_day}. des Monats`,
                            },
                            {
                                label: "Vertragsende",
                                value: record.ends_on
                                    ? date(record.ends_on)
                                    : "Unbefristet",
                            },
                        ]}
                    />
                </WorkspaceCard>
                <WorkspaceCard
                    title="Beteiligte & Ansprechpartner"
                    icon={<Users />}
                    actions={<PeopleGroup people={people} />}
                    footer={
                        <span>
                            {Number(
                                contacts.data?.total ??
                                    record.parties_count ??
                                    0,
                            )}{" "}
                            Beteiligte · vollständig im Tab „Vertragsbeteiligte“
                        </span>
                    }
                >
                    {contacts.isPending ? (
                        <Loading rows={2} />
                    ) : contacts.error ? (
                        <ErrorState
                            error={contacts.error}
                            retry={() => contacts.refetch()}
                        />
                    ) : people.length ? (
                        <div className="divide-y">
                            {contacts.data!.data.map((p) => (
                                <div
                                    key={p.id}
                                    className="flex items-center justify-between gap-3 py-3 text-sm"
                                >
                                    <Link
                                        to={`/business-partners/${p.business_partner_id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {String(
                                            (p.business_partner as RecordData)
                                                ?.display_name ??
                                                "Geschäftspartner",
                                        )}
                                    </Link>
                                    <span className="text-xs text-muted-foreground">
                                        {label(p.role)}
                                        {p.is_primary ? " · Hauptkontakt" : ""}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            title="Noch keine Beteiligten"
                            description="Ordne zunächst einen Mieter zu."
                        />
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => open("contract-parties")}
                    >
                        <CirclePlus /> Beteiligten hinzufügen
                    </Button>
                </WorkspaceCard>
            </WorkspaceColumns>
            <WorkspaceColumns>
                <WorkspaceCard
                    title="Aktuelle Kondition"
                    icon={<WalletCards />}
                    actions={
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => open("rent-conditions")}
                        >
                            <CirclePlus /> Neue Kondition
                        </Button>
                    }
                    footer={
                        <span>
                            Stichtag {date(today)} · zukünftige Konditionen
                            erscheinen in der Historie
                        </span>
                    }
                >
                    {current.isPending ? (
                        <Loading rows={2} />
                    ) : current.error ? (
                        <ErrorState
                            error={current.error}
                            retry={() => current.refetch()}
                        />
                    ) : condition ? (
                        <DetailList
                            items={[
                                {
                                    label: "Grundmiete",
                                    value: money(condition.base_rent),
                                },
                                {
                                    label: "Nebenkosten",
                                    value: money(condition.service_charge),
                                },
                                {
                                    label: "Heizkosten",
                                    value: money(condition.heating_cost),
                                },
                                {
                                    label: "Umsatzsteuer",
                                    value: `${condition.vat_rate} %`,
                                },
                                {
                                    label: "Monatlich brutto",
                                    value: money(condition.monthly_total),
                                },
                            ]}
                        />
                    ) : (
                        <EmptyState
                            title="Kondition ergänzen"
                            description="Lege den ersten gültigen Konditionsstand für diesen Vertrag an."
                        />
                    )}
                </WorkspaceCard>
                <WorkspaceCard title="Nächste Schritte" icon={<FileX2 />}>
                    <div className="space-y-4">
                        <p className="text-sm leading-6 text-muted-foreground">
                            Konditionen fortschreiben, weitere Beteiligte
                            ergänzen oder einen Kündigungseingang dokumentieren.
                            Der Vertragsbezug wird aus dieser Ansicht
                            übernommen.
                        </p>
                        <Button
                            variant="outline"
                            onClick={() => open("termination-notices")}
                        >
                            <FileX2 /> Kündigung erfassen
                        </Button>
                        <p className="text-xs leading-5 text-muted-foreground">
                            Ein Kündigungseingang beendet den Vertrag noch
                            nicht. Das Vertragsende wird erst durch die separate
                            Bestätigung gesetzt.
                        </p>
                    </div>
                </WorkspaceCard>
            </WorkspaceColumns>
            <WorkspaceCard
                title="Vertragsverwaltung"
                footer={
                    <span>
                        Direkt bearbeiten · jede Änderung wird einzeln
                        gespeichert
                    </span>
                }
            >
                <EditableKeyValueList
                    resource={contracts}
                    record={record}
                    properties={[
                        { name: "deposit_status", editable: true },
                        {
                            name: "payment_day",
                            editable: (row) => row.status === "draft",
                        },
                        { name: "notes", editable: true },
                    ]}
                />
            </WorkspaceCard>
        </Stack>
    );
}
function ContractMetric({
    title,
    value,
    description,
}: {
    title: string;
    value: string;
    description: string;
}) {
    return (
        <WorkspaceCard title={title} compact>
            <p className="text-2xl font-medium tracking-tight tabular-nums">
                {value}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{description}</p>
        </WorkspaceCard>
    );
}
