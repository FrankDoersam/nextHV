import { Building2, CarFront, Store } from "lucide-react";
import {
    EnterpriseAmountCell,
    EnterpriseAvatarGroup,
    EnterpriseDateCell,
    EnterpriseEntityCell,
    EnterprisePersonCell,
    EnterpriseProgressCell,
    EnterpriseRatingCell,
    EnterpriseStatusCell,
} from "@/components/blocks/enterprise-cells";
import { Badge } from "@/components/reui/badge";
import type {
    EnterpriseModuleConfig,
    EnterpriseTone,
} from "@/framework/tables/enterprise-types";
import {
    createDemoUnits,
    demoProperties,
    euro,
    number,
    simulateLetting,
    unitTotals,
    type DemoUnit,
    type UnitStatus,
} from "./demo-data";
import { DemoDetailField, DemoDetailSection, demoQuery } from "./demo-shared";

const statusTone: Record<UnitStatus, EnterpriseTone> = {
    Vermietet: "success",
    Leerstand: "warning",
    Sanierung: "info",
};
const squareMeters = (value: number) => `${number(value, 2)} m²`;
const options = (values: readonly string[]) =>
    values.map((value) => ({ value, label: value }));

function UnitDetail({ row }: { row: DemoUnit }) {
    const property = demoProperties.find((item) => item.id === row.propertyId)!;
    return (
        <div className="flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-2">
                <EnterpriseStatusCell
                    label={row.status}
                    tone={statusTone[row.status]}
                />
                <Badge variant="outline">{row.type}</Badge>
                {row.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                        {tag}
                    </Badge>
                ))}
            </div>
            <DemoDetailSection title="Objekt & Einheit">
                <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
                    <DemoDetailField label="Objekt">
                        {row.propertyName}
                    </DemoDetailField>
                    <DemoDetailField label="Objektnummer">
                        {row.propertyId}
                    </DemoDetailField>
                    <DemoDetailField label="Adresse">
                        {row.address}, {row.city}
                    </DemoDetailField>
                    <DemoDetailField label="Baujahr">
                        {property.yearBuilt}
                    </DemoDetailField>
                    <DemoDetailField label="Einheitsnummer">
                        {row.id}
                    </DemoDetailField>
                    <DemoDetailField label="Fläche / Zimmer">
                        {squareMeters(row.areaSqm)}
                        {row.rooms ? ` · ${row.rooms} Zimmer` : ""}
                    </DemoDetailField>
                </dl>
            </DemoDetailSection>
            <DemoDetailSection title="Miete pro Monat">
                <dl className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/20 p-4">
                    <DemoDetailField label="Nettokaltmiete (Ist)">
                        <EnterpriseAmountCell value={row.rentCents / 100} />
                    </DemoDetailField>
                    <DemoDetailField label="Zielmiete (Soll)">
                        <EnterpriseAmountCell
                            value={row.targetRentCents / 100}
                        />
                    </DemoDetailField>
                    <DemoDetailField label="Abweichung Ist − Soll">
                        <EnterpriseAmountCell
                            value={(row.rentCents - row.targetRentCents) / 100}
                            tone={
                                row.rentCents < row.targetRentCents
                                    ? "danger"
                                    : "success"
                            }
                        />
                    </DemoDetailField>
                    <DemoDetailField label="Miete pro m²">
                        {euro(row.rentCents / 100 / row.areaSqm)}
                    </DemoDetailField>
                </dl>
            </DemoDetailSection>
            <DemoDetailSection title="Vertrag & Betreuung">
                <dl className="grid grid-cols-2 gap-4">
                    <DemoDetailField label="Mietpartei">
                        {row.tenant ? (
                            <EnterprisePersonCell name={row.tenant} />
                        ) : (
                            "Nicht vermietet"
                        )}
                    </DemoDetailField>
                    <DemoDetailField label="Mietbeginn">
                        {row.leaseStart ? (
                            <EnterpriseDateCell date={row.leaseStart} />
                        ) : (
                            "Kein laufender Vertrag"
                        )}
                    </DemoDetailField>
                    <DemoDetailField label="Verantwortlich">
                        <EnterprisePersonCell
                            name={row.manager}
                            subtitle="Objektbetreuung"
                        />
                    </DemoDetailField>
                    <DemoDetailField label="Team">
                        <EnterpriseAvatarGroup
                            people={[
                                { id: "manager", name: row.manager },
                                { id: "service", name: "Luca Demodienst" },
                                { id: "accounting", name: "Jana Musterbuch" },
                                { id: "letting", name: "Alex Demo" },
                            ]}
                        />
                    </DemoDetailField>
                </dl>
            </DemoDetailSection>
            <DemoDetailSection title="Objektqualität">
                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                    <div className="flex flex-col gap-2">
                        <span className="text-xs text-muted-foreground">
                            Zustand
                        </span>
                        <EnterpriseProgressCell
                            value={row.condition}
                            variant="bar"
                            label="Zustand der Einheit"
                            tone={row.condition < 50 ? "warning" : "success"}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-xs text-muted-foreground">
                            Bewertung
                        </span>
                        <EnterpriseRatingCell
                            value={row.rating}
                            label="Objektqualität"
                        />
                    </div>
                </div>
            </DemoDetailSection>
        </div>
    );
}

export const propertiesDemoConfig: EnterpriseModuleConfig<DemoUnit> = {
    id: "properties-units",
    title: "Portfolio",
    description: "Einheiten nach Objekt · monatliche Nettokaltmieten",
    itemLabel: "Einheiten",
    rows: createDemoUnits(),
    defaultGroupBy: "property",
    defaultSorting: [{ id: "unit", desc: false }],
    searchText: (row) =>
        [
            row.id,
            row.propertyId,
            row.propertyName,
            row.address,
            row.city,
            row.label,
            row.tenant,
            row.manager,
            ...row.tags,
        ].join(" "),
    columns: [
        {
            id: "unit",
            label: "Objekt / Einheit",
            primary: true,
            width: 265,
            value: (row) => `${row.propertyName} · ${row.label}`,
            render: (row) => (
                <EnterpriseEntityCell
                    title={row.label}
                    subtitle={`${row.propertyName} · ${row.city}`}
                    icon={
                        row.type === "Stellplatz" ? (
                            <CarFront className="size-4" />
                        ) : row.type === "Gewerbe" ? (
                            <Store className="size-4" />
                        ) : (
                            <Building2 className="size-4" />
                        )
                    }
                />
            ),
        },
        {
            id: "status",
            label: "Vermietung",
            width: 125,
            value: (row) => row.status,
            render: (row) => (
                <EnterpriseStatusCell
                    label={row.status}
                    tone={statusTone[row.status]}
                />
            ),
        },
        {
            id: "tenant",
            label: "Mietpartei",
            width: 178,
            value: (row) => row.tenant,
            render: (row) =>
                row.tenant ? (
                    <EnterprisePersonCell
                        name={row.tenant}
                        subtitle={row.type}
                    />
                ) : (
                    <span className="text-xs text-muted-foreground">
                        Noch nicht vermietet
                    </span>
                ),
        },
        {
            id: "area",
            label: "Fläche",
            width: 100,
            align: "right",
            value: (row) => row.areaSqm,
            render: (row) => (
                <span className="font-medium tabular-nums">
                    {squareMeters(row.areaSqm)}
                </span>
            ),
            aggregate: (rows) => unitTotals(rows).areaSqm,
            renderAggregate: (value) => (
                <span className="font-semibold tabular-nums">
                    {squareMeters(value)}
                </span>
            ),
        },
        {
            id: "rent",
            label: "Ist-Miete",
            width: 130,
            align: "right",
            value: (row) => row.rentCents / 100,
            render: (row) => (
                <EnterpriseAmountCell value={row.rentCents / 100} />
            ),
            aggregate: (rows) => unitTotals(rows).rentCents / 100,
            renderAggregate: (value) => <EnterpriseAmountCell value={value} />,
        },
        {
            id: "targetRent",
            label: "Soll-Miete",
            width: 130,
            align: "right",
            value: (row) => row.targetRentCents / 100,
            render: (row) => (
                <EnterpriseAmountCell value={row.targetRentCents / 100} />
            ),
            aggregate: (rows) => unitTotals(rows).targetRentCents / 100,
            renderAggregate: (value) => <EnterpriseAmountCell value={value} />,
        },
        {
            id: "variance",
            label: "Abweichung",
            width: 130,
            align: "right",
            value: (row) => (row.rentCents - row.targetRentCents) / 100,
            render: (row) => (
                <EnterpriseAmountCell
                    value={(row.rentCents - row.targetRentCents) / 100}
                    tone={
                        row.rentCents < row.targetRentCents
                            ? "danger"
                            : "success"
                    }
                />
            ),
            aggregate: (rows) =>
                rows.reduce(
                    (sum, row) => sum + row.rentCents - row.targetRentCents,
                    0,
                ) / 100,
            renderAggregate: (value) => (
                <EnterpriseAmountCell
                    value={value}
                    tone={value < 0 ? "danger" : "success"}
                />
            ),
        },
        {
            id: "occupancy",
            label: "Vermietet",
            width: 110,
            value: (row) => (row.status === "Vermietet" ? 100 : 0),
            render: (row) => (
                <EnterpriseProgressCell
                    value={row.status === "Vermietet" ? 100 : 0}
                    variant="ring"
                    label="Vermietungsquote"
                    tone={row.status === "Vermietet" ? "success" : "warning"}
                />
            ),
            aggregate: (rows) => unitTotals(rows).occupancy,
            renderAggregate: (value) => (
                <EnterpriseProgressCell
                    value={value}
                    variant="ring"
                    label="Vermietungsquote der Gruppe"
                    tone={value >= 90 ? "success" : "warning"}
                />
            ),
        },
        {
            id: "manager",
            label: "Betreuung",
            width: 155,
            hidden: true,
            value: (row) => row.manager,
            render: (row) => <EnterprisePersonCell name={row.manager} />,
        },
        {
            id: "type",
            label: "Nutzungsart",
            width: 105,
            hidden: true,
            value: (row) => row.type,
            render: (row) => <Badge variant="outline">{row.type}</Badge>,
        },
        {
            id: "leaseStart",
            label: "Mietbeginn",
            width: 125,
            hidden: true,
            value: (row) => row.leaseStart,
            render: (row) =>
                row.leaseStart ? (
                    <EnterpriseDateCell date={row.leaseStart} />
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            id: "condition",
            label: "Zustand",
            width: 125,
            hidden: true,
            value: (row) => row.condition,
            render: (row) => (
                <EnterpriseProgressCell
                    value={row.condition}
                    variant="bar"
                    label="Zustand"
                    tone={row.condition < 50 ? "warning" : "success"}
                />
            ),
            aggregate: (rows) =>
                rows.length
                    ? rows.reduce((sum, row) => sum + row.condition, 0) /
                      rows.length
                    : 0,
            renderAggregate: (value) => (
                <EnterpriseProgressCell
                    value={value}
                    variant="bar"
                    label="Durchschnittlicher Zustand"
                />
            ),
        },
        {
            id: "rating",
            label: "Bewertung",
            width: 145,
            hidden: true,
            value: (row) => row.rating,
            render: (row) => <EnterpriseRatingCell value={row.rating} />,
        },
        {
            id: "tags",
            label: "Ausstattung",
            width: 180,
            hidden: true,
            value: (row) => row.tags.join(", "),
            render: (row) => (
                <div className="flex flex-wrap gap-1">
                    {row.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                            {tag}
                        </Badge>
                    ))}
                </div>
            ),
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
            label: "Vermietung",
            type: "select",
            options: options(["Vermietet", "Leerstand", "Sanierung"]),
            getValue: (row) => row.status,
        },
        {
            id: "type",
            label: "Nutzungsart",
            type: "select",
            options: options(["Wohnung", "Gewerbe", "Stellplatz"]),
            getValue: (row) => row.type,
        },
        {
            id: "manager",
            label: "Betreuung",
            type: "select",
            options: options(["Nora Beispiel", "Jonas Muster", "Mira Test"]),
            getValue: (row) => row.manager,
        },
        {
            id: "city",
            label: "Standort",
            type: "select",
            options: options(demoProperties.map((row) => row.city)),
            getValue: (row) => row.city,
        },
        {
            id: "tenant",
            label: "Mietpartei",
            type: "text",
            getValue: (row) => row.tenant,
        },
        {
            id: "area",
            label: "Fläche in m²",
            type: "number",
            getValue: (row) => row.areaSqm,
        },
        {
            id: "rent",
            label: "Ist-Miete in €",
            type: "number",
            getValue: (row) => row.rentCents / 100,
        },
        {
            id: "tags",
            label: "Ausstattung",
            type: "multiselect",
            options: options([
                "Balkon",
                "Aufzug",
                "Einbauküche",
                "Gewerbe",
                "Tiefgarage",
            ]),
            getValue: (row) => row.tags,
        },
    ],
    groups: [
        { id: "property", label: "Objekt", value: (row) => row.propertyName },
        { id: "status", label: "Vermietung", value: (row) => row.status },
        { id: "type", label: "Nutzungsart", value: (row) => row.type },
        { id: "manager", label: "Betreuung", value: (row) => row.manager },
    ],
    views: [
        { id: "all", label: "Alle Einheiten", groupBy: "property" },
        {
            id: "rented",
            label: "Vermietet",
            query: demoQuery("status", "is", "Vermietet"),
            groupBy: "property",
        },
        {
            id: "vacant",
            label: "Leerstand",
            query: demoQuery("status", "is", "Leerstand"),
            groupBy: "property",
        },
        {
            id: "renovation",
            label: "In Sanierung",
            query: demoQuery("status", "is", "Sanierung"),
            groupBy: "property",
        },
    ],
    metrics: (rows) => {
        const totals = unitTotals(rows);
        return [
            {
                id: "portfolio",
                label: "Objekte im Portfolio",
                value: number(totals.properties),
                hint: `${number(totals.units)} Einheiten · ${squareMeters(totals.areaSqm)}`,
            },
            {
                id: "occupancy",
                label: "Vermietungsquote",
                value: `${number(totals.occupancy, 1)} %`,
                hint: `${totals.rented} von ${totals.units} Einheiten vermietet`,
                tone: totals.occupancy >= 90 ? "success" : "warning",
                progress: totals.occupancy,
            },
            {
                id: "rent",
                label: "Nettokaltmiete / Monat",
                value: euro(totals.rentCents / 100),
                hint: `Zielmiete ${euro(totals.targetRentCents / 100)}`,
                tone: "info",
            },
            {
                id: "vacancy",
                label: "Leerstehende Einheiten",
                value: number(totals.vacant),
                hint: `${totals.renovation} weitere in Sanierung`,
                tone: totals.vacant ? "warning" : "success",
            },
        ];
    },
    detailTitle: (row) => row.label,
    renderDetail: (row) => <UnitDetail row={row} />,
    actions: [
        {
            id: "simulate-letting",
            label: "Vermietung simulieren",
            eligible: (row) => row.status === "Leerstand",
            apply: simulateLetting,
            successMessage: (count) =>
                `Vermietung für ${count} ${count === 1 ? "Einheit" : "Einheiten"} simuliert.`,
        },
    ],
};
