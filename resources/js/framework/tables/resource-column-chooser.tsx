import { useMemo } from "react";
import type { Table } from "@tanstack/react-table";
import { Columns3, RotateCcw } from "lucide-react";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import {
    Cascader,
    CascaderContent,
    CascaderEmpty,
    CascaderList,
    CascaderStatus,
    CascaderTrigger,
} from "@/components/reui/cascader/cascader";
import { CascaderColumns } from "@/components/reui/cascader/cascader-columns";
import { CascaderItems } from "@/components/reui/cascader/cascader-item";
import { CascaderFooter } from "@/components/reui/cascader/cascader-footer";
import {
    CascaderBreadcrumb,
    CascaderInput,
    CascaderNav,
} from "@/components/reui/cascader/cascader-nav";
import type { CascaderLabels } from "@/components/reui/cascader/cascader-types";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ResourceDefinition } from "../types";
import { defaultColumnVisibility } from "./grid-state";
import { resourceColumnTree } from "./resource-grid-model";

const labels: CascaderLabels = {
    search: "Entitäten und Spalten suchen …",
    back: "Zurück",
    loading: "Wird geladen …",
    loadingMore: "Weitere Spalten werden geladen …",
    loadMore: "Weitere laden",
    error: "Spalten konnten nicht geladen werden.",
    retry: "Erneut versuchen",
    empty: "Keine passenden Spalten",
    selectedCount: (count) => `${count} Spalten sichtbar`,
    breadcrumbLabel: "Spaltenpfad",
    chipsLabel: "Sichtbare Spalten",
    removeChip: (label) => `${label} ausblenden`,
    pathSeparator: "/",
    rootLevel: "Entitäten",
    itemCount: (count) => `${count} Spalten`,
    branchAffordance: "Spalten öffnen",
    selectedState: "sichtbar",
    partiallySelectedState: "teilweise sichtbar",
    columnsLabel: "Entitäten und Spalten",
    actionsLabel: "Spaltenaktionen",
    submenuAffordance: "Untermenü öffnen",
    panelLabel: "Spalten auswählen",
    keyboardHint: () =>
        "Mit den Pfeiltasten navigieren, mit Enter die Sichtbarkeit ändern.",
    rootAnnouncement: (count) => `${count} Entitäten`,
    expandedAnnouncement: (label, count) => `${label}: ${count} Spalten`,
    collapsedAnnouncement: (label) => `${label} geschlossen`,
    levelAnnouncement: (label, _depth, count) => `${label}: ${count} Spalten`,
    resultsAnnouncement: (count) => `${count} Treffer`,
    maxReachedAnnouncement: (max) => `Höchstens ${max} Spalten`,
    cascadeAnnouncement: (label, count, selecting) =>
        `${label}: ${count} Spalten ${selecting ? "eingeblendet" : "ausgeblendet"}`,
    searchingAnnouncement: "Spalten werden gesucht …",
};

export function ResourceColumnChooser<TData extends object>({
    resource,
    table,
}: {
    resource: ResourceDefinition;
    table: Table<DataGridFeatures, TData>;
}) {
    const mobile = useIsMobile();
    const items = useMemo(() => resourceColumnTree(resource), [resource]);
    const visible = resource.columns
        .filter((column) => table.getColumn(column.field)?.getIsVisible())
        .map((column) => column.field);
    return (
        <Cascader
            multiple
            items={items}
            value={visible}
            mode={mobile ? "drill" : "columns"}
            searchScope="global"
            revealSelected={false}
            labels={labels}
            maxHeight="min(22rem, 55vh)"
            onValueChange={(values) => {
                const selected = new Set(values);
                table.setColumnVisibility(
                    Object.fromEntries(
                        resource.columns.map((column) => [
                            column.field,
                            column.hideable === false ||
                                selected.has(column.field),
                        ]),
                    ),
                );
            }}
            actions={[
                {
                    label: "Standardspalten wiederherstellen",
                    icon: <RotateCcw className="size-3.5" />,
                    onSelect: () =>
                        table.setColumnVisibility(
                            defaultColumnVisibility(resource),
                        ),
                },
            ]}
        >
            <CascaderTrigger
                showIcon={false}
                aria-label="Spalten"
                render={
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                    />
                }
            >
                <Columns3 className="size-3.5" />
                <span className="hidden sm:inline">Spalten</span>
            </CascaderTrigger>
            <CascaderContent align="end" className="max-w-[calc(100vw-2rem)]">
                <CascaderNav>
                    <CascaderInput placeholder="Spalten suchen …" />
                </CascaderNav>
                {mobile && <CascaderBreadcrumb />}
                <CascaderEmpty />
                {mobile ? (
                    <CascaderList>
                        <CascaderItems />
                    </CascaderList>
                ) : (
                    <CascaderColumns columnWidth={220} />
                )}
                <CascaderFooter />
                <CascaderStatus />
            </CascaderContent>
        </Cascader>
    );
}
