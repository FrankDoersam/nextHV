import { Building2 } from "lucide-react";
import { EnterprisePersonCell } from "@/components/blocks/enterprise-cells";
import type { EnterpriseModuleConfig } from "@/framework/tables/enterprise-types";
import { demoProperties, type DemoProperty } from "./demo-data";
import { DemoDetailField, DemoDetailSection, demoQuery } from "./demo-shared";

const options = (values: readonly string[]) =>
    [...new Set(values)].map((value) => ({ value, label: value }));

function PropertyDetail({ row }: { row: DemoProperty }) {
    return (
        <div className="flex flex-col gap-7">
            <DemoDetailSection title="Objektstammdaten">
                <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                    <DemoDetailField label="Objektnummer">
                        {row.id}
                    </DemoDetailField>
                    <DemoDetailField label="Objektname">
                        {row.name}
                    </DemoDetailField>
                    <DemoDetailField label="Straße und Hausnummer">
                        {row.address}
                    </DemoDetailField>
                    <DemoDetailField label="Ort">{row.city}</DemoDetailField>
                    <DemoDetailField label="Baujahr">
                        {row.yearBuilt}
                    </DemoDetailField>
                </dl>
            </DemoDetailSection>
            <DemoDetailSection title="Betreuung">
                <dl>
                    <DemoDetailField label="Objektbetreuung">
                        <EnterprisePersonCell name={row.manager} />
                    </DemoDetailField>
                </dl>
            </DemoDetailSection>
        </div>
    );
}

export const propertiesDemoConfig: EnterpriseModuleConfig<DemoProperty> = {
    id: "properties-master-data",
    title: "Objekte",
    description: "Stammdaten, Anschriften und Betreuung Ihrer Objekte.",
    itemLabel: "Objekte",
    rows: demoProperties,
    defaultQuery: demoQuery("address", "contains", ""),
    defaultSorting: [{ id: "number", desc: false }],
    searchText: (row) =>
        [
            row.id,
            row.name,
            row.address,
            row.city,
            row.manager,
            row.yearBuilt,
        ].join(" "),
    columns: [
        {
            id: "address",
            label: "Objektanschrift",
            primary: true,
            width: 360,
            value: (row) => `${row.name} · ${row.address}, ${row.city}`,
            render: (row) => (
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                        {row.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                        {row.address}, {row.city}
                    </div>
                </div>
            ),
        },
        {
            id: "number",
            label: "Objektnummer",
            width: 140,
            value: (row) => row.id,
            render: (row) => (
                <span className="text-sm tabular-nums">{row.id}</span>
            ),
        },
        {
            id: "city",
            label: "Ort",
            width: 160,
            value: (row) => row.city,
            render: (row) => (
                <span className="truncate text-sm">{row.city}</span>
            ),
        },
        {
            id: "manager",
            label: "Betreuung",
            width: 190,
            value: (row) => row.manager,
            render: (row) => <EnterprisePersonCell name={row.manager} />,
        },
        {
            id: "yearBuilt",
            label: "Baujahr",
            width: 100,
            value: (row) => row.yearBuilt,
            render: (row) => (
                <span className="text-sm tabular-nums">{row.yearBuilt}</span>
            ),
        },
    ],
    filters: [
        {
            id: "address",
            label: "Objektanschrift",
            icon: <Building2 className="size-3.5" aria-hidden="true" />,
            type: "text",
            placeholder: "Suchen...",
            getValue: (row) => `${row.name} ${row.address} ${row.city}`,
        },
        {
            id: "number",
            label: "Objektnummer",
            type: "text",
            getValue: (row) => row.id,
        },
        {
            id: "city",
            label: "Ort",
            type: "select",
            options: options(demoProperties.map((row) => row.city)),
            getValue: (row) => row.city,
        },
        {
            id: "manager",
            label: "Betreuung",
            type: "select",
            options: options(demoProperties.map((row) => row.manager)),
            getValue: (row) => row.manager,
        },
        {
            id: "yearBuilt",
            label: "Baujahr",
            type: "number",
            getValue: (row) => row.yearBuilt,
        },
    ],
    groups: [],
    views: [],
    metrics: () => [],
    detailTitle: (row) => row.name,
    renderDetail: (row) => <PropertyDetail row={row} />,
};
