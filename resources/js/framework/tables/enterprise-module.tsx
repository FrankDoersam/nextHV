import { useCallback, useEffect, useMemo, useState } from "react";
import type {
    Column,
    ColumnDef,
    ColumnPinningState,
    ColumnVisibilityState,
    PaginationState,
    RowSelectionState,
    SortingState,
    Updater,
} from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import {
    Bookmark,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
    Download,
    Ellipsis,
    Eye,
    Layers3,
    RotateCcw,
    Save,
    Search,
    Columns2,
    Funnel,
    SlidersHorizontal,
    X,
} from "lucide-react";
import { PageHeader } from "@/components/blocks/layout";
import { Separator } from "@/components/ui/separator";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { EnterpriseProgressCell } from "@/components/blocks/enterprise-cells";
import { Badge } from "@/components/reui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    useDataGrid,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import {
    DataGridTable,
    DataGridTableRowSelect,
    DataGridTableRowSelectAll,
    getPinningStyles,
} from "@/components/reui/data-grid/data-grid-table";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridColumnVisibility } from "@/components/reui/data-grid/data-grid-column-visibility";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { Filters } from "@/components/reui/filters/filters";
import { createFilterQuery } from "@/components/reui/filters/filters-query";
import type { FilterQuery } from "@/components/reui/filters/filters-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { useGridI18n } from "@/framework/i18n";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
    buildEnterprisePage,
    enterpriseCsv,
    selectEnterpriseRows,
    type EnterpriseDisplayRow,
} from "./enterprise-model";
import {
    enterpriseFilterLabels,
    enterpriseOperatorLabels,
} from "./enterprise-labels";
import {
    loadEnterpriseViews,
    saveEnterpriseViews,
    type SavedEnterpriseView,
} from "./enterprise-preferences";
import type {
    EnterpriseAction,
    EnterpriseColumn,
    EnterpriseModuleConfig,
    EnterpriseRecord,
    EnterpriseView,
} from "./enterprise-types";

const resolve = <T,>(next: Updater<T>, current: T): T =>
    typeof next === "function" ? (next as (previous: T) => T)(current) : next;
const needsAdvanced = (query: FilterQuery) =>
    query.combinator === "or" ||
    query.rules.some((rule) => rule.type === "group");

function initialVisibility<T extends EnterpriseRecord>(
    config: EnterpriseModuleConfig<T>,
): ColumnVisibilityState {
    return Object.fromEntries(
        config.columns
            .filter((column) => column.hidden && !column.primary)
            .map((column) => [column.id, false]),
    );
}

function initiallyCollapsed<T extends EnterpriseRecord>(
    config: EnterpriseModuleConfig<T>,
    groupBy: string,
    scope: readonly T[] = config.rows,
): Set<string> {
    const group = config.groups.find((entry) => entry.id === groupBy);
    if (!group) return new Set();
    return new Set(
        buildEnterprisePage(
            scope,
            group,
            { pageIndex: 0, pageSize: 3 },
            new Set(),
        )
            .groups.slice(1)
            .map((entry) => entry.id),
    );
}

/** Shared behavior; domain modules provide fixtures, cells, filters and aggregates. */
export function EnterpriseModule<T extends EnterpriseRecord>({
    config,
}: {
    config: EnterpriseModuleConfig<T>;
}) {
    const firstView = config.views[0];
    const initialGroup = firstView?.groupBy ?? config.defaultGroupBy ?? "";
    const [rows, setRows] = useState<T[]>(() =>
        config.rows.map((row) => ({ ...row })),
    );
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState<FilterQuery>(
        () => firstView?.query ?? config.defaultQuery ?? createFilterQuery(),
    );
    const [sorting, setSorting] = useState<SortingState>(
        config.defaultSorting ?? [],
    );
    const [groupBy, setGroupBy] = useState(initialGroup);
    const [collapsed, setCollapsed] = useState<Set<string>>(() =>
        initiallyCollapsed(config, initialGroup),
    );
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: initialGroup ? 3 : 10,
    });
    const [selection, setSelection] = useState<RowSelectionState>({});
    const [visibility, setVisibility] = useState<ColumnVisibilityState>(() =>
        initialVisibility(config),
    );
    const [columnOrder, setColumnOrder] = useState<string[]>([]);
    const [pinning, setPinning] = useState<ColumnPinningState>({
        start: [],
        end: [],
    });
    const [density, setDensity] = useState<"comfortable" | "compact">(
        "comfortable",
    );
    const [advanced, setAdvanced] = useState(false);
    const [activeView, setActiveView] = useState(firstView?.id ?? "custom");
    const [detailId, setDetailId] = useState<string | null>(null);
    const [notice, setNotice] = useState("");
    const [savedViews, setSavedViews] = useState<SavedEnterpriseView[]>(() =>
        loadEnterpriseViews(config.id),
    );
    const [saveOpen, setSaveOpen] = useState(false);
    const [viewName, setViewName] = useState("");
    const [saveError, setSaveError] = useState("");
    const gridI18n = useGridI18n();
    const isMobile = useIsMobile();

    const scopedRows = useMemo(
        () => (config.scope ? rows.filter(config.scope) : rows),
        [rows, config],
    );
    const hasAggregates = config.columns.some((column) => column.aggregate);
    const referenceToolbar = Boolean(config.defaultQuery);

    const filtered = useMemo(
        () => selectEnterpriseRows(rows, config, { search, query, sorting }),
        [rows, config, search, query, sorting],
    );
    const group = config.groups.find((entry) => entry.id === groupBy);
    const page = useMemo(
        () => buildEnterprisePage(filtered, group, pagination, collapsed),
        [filtered, group, pagination, collapsed],
    );
    const selectedRows = useMemo(
        () => filtered.filter((row) => selection[`record:${row.id}`]),
        [filtered, selection],
    );
    const metrics = useMemo(() => config.metrics(filtered), [config, filtered]);
    const detail = rows.find((row) => row.id === detailId);
    const allCollapsed =
        page.groups.length > 0 &&
        page.groups.every((entry) => collapsed.has(entry.id));

    useEffect(() => {
        if (pagination.pageIndex !== page.pageIndex)
            setPagination((current) => ({
                ...current,
                pageIndex: page.pageIndex,
            }));
    }, [page.pageIndex, pagination.pageIndex]);

    const resetScope = useCallback(() => {
        setSelection({});
        setPagination((current) => ({ ...current, pageIndex: 0 }));
        setActiveView("custom");
    }, []);

    const changeGroup = (value: string) => {
        resetScope();
        setGroupBy(value);
        setCollapsed(initiallyCollapsed(config, value, filtered));
        setPagination({ pageIndex: 0, pageSize: value ? 3 : 10 });
    };

    const applyView = (view: EnterpriseView) => {
        setSearch("");
        const nextQuery =
            view.query ?? config.defaultQuery ?? createFilterQuery();
        setQuery(nextQuery);
        const nextGroup = view.groupBy ?? config.defaultGroupBy ?? "";
        setGroupBy(nextGroup);
        setCollapsed(
            initiallyCollapsed(
                config,
                nextGroup,
                selectEnterpriseRows(rows, config, {
                    search: "",
                    query: nextQuery,
                    sorting,
                }),
            ),
        );
        setPagination({ pageIndex: 0, pageSize: nextGroup ? 3 : 10 });
        setSelection({});
        setActiveView(view.id);
        setNotice("");
    };

    const applySavedView = (view: SavedEnterpriseView) => {
        const state = view.state;
        setSearch(state.search);
        setQuery(state.query);
        setSorting(
            state.sorting.filter((entry) =>
                config.columns.some((column) => column.id === entry.id),
            ),
        );
        const nextGroup = config.groups.some(
            (entry) => entry.id === state.groupBy,
        )
            ? state.groupBy
            : "";
        setGroupBy(nextGroup);
        setCollapsed(
            initiallyCollapsed(
                config,
                nextGroup,
                selectEnterpriseRows(rows, config, state),
            ),
        );
        const primary =
            config.columns.find((column) => column.primary)?.id ??
            config.columns[0].id;
        setVisibility({
            ...state.visibility,
            [primary]: true,
            selection: true,
            actions: true,
        });
        setDensity(state.density);
        const availableColumns = new Set([
            "selection",
            "actions",
            ...config.columns.map((column) => column.id),
        ]);
        setColumnOrder(
            state.columnOrder.filter((id) => availableColumns.has(id)),
        );
        setPinning({
            start: (state.pinning.start ?? []).filter((id) =>
                availableColumns.has(id),
            ),
            end: (state.pinning.end ?? []).filter((id) =>
                availableColumns.has(id),
            ),
        });
        setPagination({ pageIndex: 0, pageSize: nextGroup ? 3 : 10 });
        setSelection({});
        setActiveView(view.id);
        setNotice(`Ansicht „${view.label}“ geladen.`);
    };

    const runAction = useCallback(
        (action: EnterpriseAction<T>, targets: readonly T[]) => {
            const ids = new Set(
                targets
                    .filter((row) => !action.eligible || action.eligible(row))
                    .map((row) => row.id),
            );
            if (!ids.size) {
                setNotice(
                    "Für diese Aktion sind keine passenden Datensätze ausgewählt.",
                );
                return;
            }
            setRows((current) =>
                current.map((row) =>
                    ids.has(row.id) ? action.apply(row) : row,
                ),
            );
            setSelection({});
            setNotice(action.successMessage(ids.size));
        },
        [],
    );

    const download = (
        exportRows: readonly T[],
        exportColumns: EnterpriseColumn<T>[],
        label: string,
    ) => {
        const url = URL.createObjectURL(
            new Blob([enterpriseCsv(exportRows, exportColumns)], {
                type: "text/csv;charset=utf-8",
            }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${config.id}-${label}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice(
            `${exportRows.length} ${config.itemLabel} als CSV exportiert (${label}).`,
        );
    };

    const toggleGroup = useCallback(
        (id: string) =>
            setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            }),
        [],
    );

    const columns = useMemo<
        ColumnDef<DataGridFeatures, EnterpriseDisplayRow<T>>[]
    >(
        () => [
            {
                id: "selection",
                meta: { headerClassName: "ps-4", cellClassName: "ps-4" },
                header: () => <DataGridTableRowSelectAll />,
                cell: ({ row }) =>
                    row.original.kind === "record" ? (
                        <DataGridTableRowSelect row={row} />
                    ) : null,
                size: 40,
                minSize: 40,
                maxSize: 40,
                enableSorting: false,
                enableHiding: false,
                enableResizing: false,
                enablePinning: true,
            },
            ...config.columns.map(
                (
                    definition,
                ): ColumnDef<DataGridFeatures, EnterpriseDisplayRow<T>> => ({
                    id: definition.id,
                    accessorFn: (entry) =>
                        entry.kind === "record"
                            ? definition.value(entry.record)
                            : definition.primary
                              ? entry.label
                              : undefined,
                    header: ({ column }) => (
                        <DataGridColumnHeader
                            column={column}
                            title={definition.label}
                        />
                    ),
                    meta: {
                        headerTitle: definition.label,
                        headerClassName: cn(
                            definition.align === "right" && "text-right",
                        ),
                        cellClassName: cn(
                            definition.align === "right" && "text-right",
                        ),
                    },
                    size: definition.width ?? 150,
                    minSize: definition.primary ? 220 : 100,
                    enableHiding: !definition.primary,
                    cell: ({ row }) => {
                        const entry = row.original;
                        if (entry.kind === "group") {
                            if (definition.primary)
                                return (
                                    <button
                                        type="button"
                                        data-enterprise-group="true"
                                        aria-expanded={!collapsed.has(entry.id)}
                                        aria-label={`${entry.label}: ${collapsed.has(entry.id) ? "aufklappen" : "zuklappen"}`}
                                        onClick={() => toggleGroup(entry.id)}
                                        className="flex w-full min-w-0 items-center gap-2 rounded-sm py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {collapsed.has(entry.id) ? (
                                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                                        ) : (
                                            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                                        )}
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-semibold">
                                                {entry.label}
                                            </span>
                                            <span className="block text-xs font-normal text-muted-foreground">
                                                {entry.rows.length}{" "}
                                                {config.itemLabel}
                                            </span>
                                        </span>
                                    </button>
                                );
                            if (!definition.aggregate) return null;
                            const value = definition.aggregate(entry.rows);
                            return (
                                <div
                                    data-enterprise-group="true"
                                    className="font-semibold tabular-nums"
                                >
                                    {definition.renderAggregate?.(
                                        value,
                                        entry.rows,
                                    ) ?? value.toLocaleString("de-DE")}
                                </div>
                            );
                        }
                        if (definition.primary)
                            return (
                                <button
                                    type="button"
                                    aria-label={`${config.detailTitle(entry.record)} – Details öffnen`}
                                    onClick={() => setDetailId(entry.record.id)}
                                    className={cn(
                                        "block w-full min-w-0 rounded-sm text-left outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring",
                                        groupBy && "pl-6",
                                    )}
                                >
                                    {definition.render(entry.record)}
                                </button>
                            );
                        return definition.render(entry.record);
                    },
                }),
            ),
            {
                id: "actions",
                header: "",
                meta: { headerClassName: "pe-4", cellClassName: "pe-4" },
                size: 52,
                minSize: 52,
                maxSize: 52,
                enableSorting: false,
                enableHiding: false,
                enableResizing: false,
                enablePinning: false,
                cell: ({ row }) =>
                    row.original.kind === "record" ? (
                        <EnterpriseRowActions
                            record={row.original.record}
                            config={config}
                            onOpen={() =>
                                setDetailId(
                                    row.original.kind === "record"
                                        ? row.original.record.id
                                        : null,
                                )
                            }
                            onAction={runAction}
                        />
                    ) : null,
            },
        ],
        [config, collapsed, toggleGroup, groupBy, runAction],
    );

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: page.displayRows,
        getRowId: (row) => row.id,
        rowCount: page.recordCount,
        manualPagination: true,
        manualFiltering: true,
        manualSorting: true,
        state: {
            sorting,
            pagination: { ...pagination, pageIndex: page.pageIndex },
            rowSelection: selection,
            columnVisibility: visibility,
            columnPinning: pinning,
            columnOrder,
        },
        onSortingChange: (next) => {
            setSorting(next);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
            setActiveView("custom");
        },
        onPaginationChange: (next) =>
            setPagination((current) => {
                const updated = resolve(next, {
                    ...current,
                    pageIndex: page.pageIndex,
                });
                return updated.pageSize !== current.pageSize
                    ? { ...updated, pageIndex: 0 }
                    : updated;
            }),
        onRowSelectionChange: setSelection,
        onColumnVisibilityChange: setVisibility,
        onColumnPinningChange: setPinning,
        onColumnOrderChange: setColumnOrder,
        enableRowSelection: (row) => row.original.kind === "record",
        enableMultiRowSelection: true,
    });

    const exportColumns = () =>
        [
            ...table.getStartVisibleLeafColumns(),
            ...table.getCenterVisibleLeafColumns(),
            ...table.getEndVisibleLeafColumns(),
        ].flatMap((column) => {
            const definition = config.columns.find(
                (entry) => entry.id === column.id,
            );
            return definition ? [definition] : [];
        });

    const resetDemo = () => {
        setRows(config.rows.map((row) => ({ ...row })));
        applyView(firstView ?? { id: "all", label: "Alle" });
        setSorting(config.defaultSorting ?? []);
        setVisibility(initialVisibility(config));
        setColumnOrder([]);
        setPinning({
            start: [],
            end: [],
        });
        setDensity("comfortable");
        setAdvanced(false);
        setDetailId(null);
        setNotice(
            "Demo-Daten und Tabellenansicht zurückgesetzt. Gespeicherte Ansichten bleiben erhalten.",
        );
    };

    return (
        <div
            data-slot="enterprise-module"
            data-module={config.id}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
        >
            <div className="shrink-0">
                <PageHeader
                    title={config.title}
                    description={config.description}
                    actions={
                        <>
                            {savedViews.length > 0 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        render={
                                            <Button
                                                variant="outline"
                                                size="sm"
                                            />
                                        }
                                    >
                                        <Bookmark className="size-3.5" />
                                        Meine Ansichten
                                        <ChevronDown className="size-3" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {savedViews.map((view) => (
                                            <DropdownMenuItem
                                                key={view.id}
                                                onClick={() =>
                                                    applySavedView(view)
                                                }
                                            >
                                                {activeView === view.id && (
                                                    <Check className="size-3" />
                                                )}
                                                {view.label}
                                            </DropdownMenuItem>
                                        ))}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={() => {
                                                if (
                                                    saveEnterpriseViews(
                                                        config.id,
                                                        [],
                                                    )
                                                ) {
                                                    setSavedViews([]);
                                                    setNotice(
                                                        "Gespeicherte Demo-Ansichten gelöscht.",
                                                    );
                                                } else
                                                    setNotice(
                                                        "Die gespeicherten Ansichten konnten nicht gelöscht werden.",
                                                    );
                                            }}
                                        >
                                            Gespeicherte Ansichten löschen
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={savedViews.length >= 12}
                                onClick={() => {
                                    setViewName("");
                                    setSaveError("");
                                    setSaveOpen(true);
                                }}
                            >
                                <Bookmark className="size-3.5" />
                                Ansicht speichern
                            </Button>
                            <Button
                                size="sm"
                                disabled={!filtered.length}
                                onClick={() =>
                                    download(
                                        filtered,
                                        exportColumns(),
                                        "gefiltert",
                                    )
                                }
                            >
                                <Download className="size-3.5" />
                                Export
                            </Button>
                        </>
                    }
                />
            </div>
            {metrics.length > 0 && (
                <Card
                    data-slot="enterprise-kpis"
                    aria-label="Kennzahlen der gefilterten Datensätze"
                    className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 p-3 sm:p-4 xl:grid-cols-4"
                >
                    {metrics.map((metric) => (
                        <div
                            key={metric.id}
                            data-testid={`metric-${metric.id}`}
                            className="flex min-w-0 items-center justify-between gap-2 xl:border-r xl:pr-4 xl:last:border-r-0 xl:last:pr-0"
                        >
                            <div className="flex min-w-0 flex-col gap-1">
                                <span className="text-xs text-muted-foreground">
                                    {metric.label}
                                </span>
                                <span
                                    className={cn(
                                        "text-lg font-semibold tracking-tight tabular-nums sm:text-2xl",
                                        metric.tone === "danger" &&
                                            "text-destructive",
                                        metric.tone === "success" &&
                                            "text-success-foreground",
                                    )}
                                >
                                    {metric.value}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {metric.hint}
                                </span>
                            </div>
                            {metric.progress !== undefined && (
                                <div className="hidden shrink-0 sm:block">
                                    <EnterpriseProgressCell
                                        value={metric.progress}
                                        label={metric.label}
                                        variant="ring"
                                        tone={metric.tone}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </Card>
            )}
            <Card
                data-testid="enterprise-grid"
                className="min-h-0 min-w-0 flex-1 gap-0 p-0"
            >
                <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-0">
                    <DataGrid
                        table={table}
                        recordCount={page.recordCount}
                        i18n={{
                            labels: {
                                ...gridI18n.labels,
                                selectAll: "Alle sichtbaren Zeilen auswählen",
                                pinColumnStart: "Links fixieren",
                                pinColumnEnd: "Rechts fixieren",
                                moveColumnStart: "Nach links verschieben",
                                moveColumnEnd: "Nach rechts verschieben",
                                unpinColumn: (title) =>
                                    `Fixierung von ${title} aufheben`,
                            },
                        }}
                        tableLayout={{
                            width: "fixed",
                            dense: referenceToolbar || density === "compact",
                            cellBorder: false,
                            rowBorder: true,
                            headerBackground: false,
                            footerBackground: true,
                            headerSticky: true,
                            columnsVisibility: true,
                            columnsResizable: true,
                            columnsPinnable: !isMobile,
                            columnsMovable: true,
                        }}
                        tableClassNames={{
                            bodyRow:
                                "has-[[data-enterprise-group]]:bg-muted/45",
                        }}
                        emptyMessage={
                            <div className="flex flex-col items-center gap-2 py-8">
                                <Search className="size-6 text-muted-foreground" />
                                <span className="font-medium text-foreground">
                                    Keine passenden {config.itemLabel}
                                </span>
                                <span>Suche oder Filter anpassen.</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSearch("");
                                        setQuery(
                                            config.defaultQuery ??
                                                createFilterQuery(),
                                        );
                                        resetScope();
                                    }}
                                >
                                    Filter zurücksetzen
                                </Button>
                            </div>
                        }
                    >
                        {config.views.length > 0 && (
                            <div
                                role="group"
                                aria-label="Vordefinierte Ansichten"
                                className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-3 pt-2"
                            >
                                {config.views.map((view) => (
                                    <Button
                                        key={view.id}
                                        variant="ghost"
                                        size="sm"
                                        aria-pressed={activeView === view.id}
                                        onClick={() => applyView(view)}
                                        className={cn(
                                            activeView === view.id &&
                                                "bg-muted",
                                        )}
                                    >
                                        {view.label}
                                        <Badge variant="secondary" size="sm">
                                            {
                                                selectEnterpriseRows(
                                                    rows,
                                                    config,
                                                    {
                                                        search: "",
                                                        query:
                                                            view.query ??
                                                            createFilterQuery(),
                                                        sorting: [],
                                                    },
                                                ).length
                                            }
                                        </Badge>
                                    </Button>
                                ))}
                            </div>
                        )}
                        <div
                            data-slot="enterprise-toolbar"
                            className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-5 py-3"
                        >
                            {!referenceToolbar && (
                                <div className="relative min-w-48 flex-1 sm:max-w-80">
                                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        aria-label={`${config.itemLabel} durchsuchen`}
                                        placeholder="Suchen …"
                                        value={search}
                                        onChange={(event) => {
                                            setSearch(event.target.value);
                                            resetScope();
                                        }}
                                        className="h-8 pr-8 pl-8 text-xs"
                                    />
                                    {search && (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="Suche löschen"
                                            className="absolute top-0 right-0"
                                            onClick={() => {
                                                setSearch("");
                                                resetScope();
                                            }}
                                        >
                                            <X className="size-3.5" />
                                        </Button>
                                    )}
                                </div>
                            )}
                            <Filters
                                fields={config.filters}
                                query={query}
                                onQueryChange={(next) => {
                                    setQuery(next);
                                    resetScope();
                                }}
                                labels={enterpriseFilterLabels}
                                operatorLabels={enterpriseOperatorLabels}
                                variant={
                                    advanced || needsAdvanced(query)
                                        ? "advanced"
                                        : "basic"
                                }
                                onConvertToAdvanced={() => setAdvanced(true)}
                                size="default"
                                className={
                                    referenceToolbar &&
                                    !advanced &&
                                    !needsAdvanced(query)
                                        ? "contents"
                                        : "min-w-0"
                                }
                                trigger={
                                    referenceToolbar ? (
                                        <Button
                                            variant="outline"
                                            size="default"
                                            aria-label="Filter"
                                        >
                                            <Funnel className="size-4" />
                                            Filter
                                        </Button>
                                    ) : undefined
                                }
                            />
                            {referenceToolbar &&
                                advanced &&
                                !needsAdvanced(query) && (
                                    <Button
                                        variant="outline"
                                        size="default"
                                        onClick={() => setAdvanced(false)}
                                    >
                                        Einfache Filter
                                    </Button>
                                )}
                            {config.groups.length > 0 && (
                                <Select
                                    value={groupBy || "none"}
                                    onValueChange={(value) =>
                                        changeGroup(
                                            value === "none"
                                                ? ""
                                                : String(value),
                                        )
                                    }
                                >
                                    <SelectTrigger
                                        aria-label="Gruppierung"
                                        className="h-8 w-auto min-w-40 text-xs"
                                    >
                                        <Layers3 className="size-3.5 text-muted-foreground" />
                                        <SelectValue>
                                            {group
                                                ? `Nach ${group.label}`
                                                : "Ohne Gruppierung"}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">
                                            Ohne Gruppierung
                                        </SelectItem>
                                        {config.groups.map((entry) => (
                                            <SelectItem
                                                key={entry.id}
                                                value={entry.id}
                                            >
                                                Nach {entry.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            {group && (
                                <Button
                                    size="icon-sm"
                                    variant="outline"
                                    aria-label={
                                        allCollapsed
                                            ? "Alle Gruppen aufklappen"
                                            : "Alle Gruppen zuklappen"
                                    }
                                    onClick={() =>
                                        setCollapsed(
                                            allCollapsed
                                                ? new Set()
                                                : new Set(
                                                      page.groups.map(
                                                          (entry) => entry.id,
                                                      ),
                                                  ),
                                        )
                                    }
                                >
                                    {allCollapsed ? (
                                        <ChevronsUpDown />
                                    ) : (
                                        <ChevronsDownUp />
                                    )}
                                </Button>
                            )}
                            <div className="ml-auto flex flex-wrap items-center gap-2">
                                <DataGridColumnVisibility
                                    table={table}
                                    trigger={
                                        <Button
                                            variant="outline"
                                            size="default"
                                            aria-label="Spalten"
                                        >
                                            <Columns2 className="size-4" />
                                            Spalten
                                        </Button>
                                    }
                                />
                                {!referenceToolbar && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger
                                            render={
                                                <Button
                                                    variant="outline"
                                                    size="icon-sm"
                                                    aria-label="Darstellung einstellen"
                                                />
                                            }
                                        >
                                            <SlidersHorizontal className="size-3.5" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuCheckboxItem
                                                checked={density === "compact"}
                                                onCheckedChange={(checked) =>
                                                    setDensity(
                                                        checked
                                                            ? "compact"
                                                            : "comfortable",
                                                    )
                                                }
                                            >
                                                Kompakte Zeilen
                                            </DropdownMenuCheckboxItem>
                                            <DropdownMenuCheckboxItem
                                                checked={
                                                    advanced ||
                                                    needsAdvanced(query)
                                                }
                                                disabled={needsAdvanced(query)}
                                                onCheckedChange={(checked) =>
                                                    setAdvanced(!!checked)
                                                }
                                            >
                                                Erweiterte Filter
                                            </DropdownMenuCheckboxItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => {
                                                    setVisibility(
                                                        initialVisibility(
                                                            config,
                                                        ),
                                                    );
                                                    setColumnOrder([]);
                                                    setPinning({
                                                        start: [],
                                                        end: [],
                                                    });
                                                    table.resetColumnSizing();
                                                }}
                                            >
                                                Spalten zurücksetzen
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        </div>
                        {selectedRows.length > 0 && (
                            <div
                                role="region"
                                aria-label="Ausgewählte Datensätze"
                                className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-primary/5 px-3 py-2"
                            >
                                <Badge variant="primary-light">
                                    {selectedRows.length} ausgewählt
                                </Badge>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        setSelection(
                                            Object.fromEntries(
                                                filtered.map((row) => [
                                                    `record:${row.id}`,
                                                    true,
                                                ]),
                                            ),
                                        )
                                    }
                                >
                                    Alle {filtered.length} Treffer auswählen
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        download(
                                            selectedRows,
                                            exportColumns(),
                                            "auswahl",
                                        )
                                    }
                                >
                                    <Download className="size-3.5" />
                                    Auswahl exportieren
                                </Button>
                                {config.actions?.map((action) => (
                                    <Button
                                        key={action.id}
                                        variant="outline"
                                        size="sm"
                                        disabled={
                                            !selectedRows.some(
                                                (row) =>
                                                    !action.eligible ||
                                                    action.eligible(row),
                                            )
                                        }
                                        onClick={() =>
                                            runAction(action, selectedRows)
                                        }
                                    >
                                        {action.label}
                                    </Button>
                                ))}
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="ml-auto"
                                    aria-label="Auswahl aufheben"
                                    onClick={() => setSelection({})}
                                >
                                    <X className="size-3.5" />
                                </Button>
                            </div>
                        )}
                        <Separator />
                        <div
                            data-slot="enterprise-grid-scroll"
                            className="min-h-0 flex-1"
                        >
                            <DataGridContainer className="h-full [&>div]:h-full">
                                <DataGridScrollArea className="h-full">
                                    <DataGridTable
                                        footerContent={
                                            hasAggregates ? (
                                                <>
                                                    <EnterpriseTotals
                                                        config={config}
                                                        rows={filtered}
                                                        label="Gesamtsumme"
                                                    />
                                                    {selectedRows.length >
                                                        0 && (
                                                        <EnterpriseTotals
                                                            config={config}
                                                            rows={selectedRows}
                                                            label="Auswahl"
                                                        />
                                                    )}
                                                </>
                                            ) : undefined
                                        }
                                    />
                                </DataGridScrollArea>
                            </DataGridContainer>
                        </div>
                        <CardFooter
                            data-testid="enterprise-footer"
                            className="shrink-0 flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-card px-4 py-2"
                        >
                            <span
                                className="sr-only text-xs text-muted-foreground sm:not-sr-only"
                                aria-live="polite"
                            >
                                {filtered.length} von {scopedRows.length}{" "}
                                {config.itemLabel}
                            </span>
                            <DataGridPagination
                                compact
                                className="min-w-0 flex-1 sm:w-auto"
                                sizes={group ? [1, 3, 6, 12] : [10, 20, 50]}
                                rowsPerPageLabel={
                                    group
                                        ? "Gruppen pro Seite"
                                        : "Zeilen pro Seite"
                                }
                                info={
                                    group
                                        ? "Gruppe {from}–{to} von {count}"
                                        : "{from}–{to} von {count}"
                                }
                            />
                        </CardFooter>
                    </DataGrid>
                </CardContent>
            </Card>
            <div className="flex shrink-0 items-center justify-end gap-2">
                <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={resetDemo}
                >
                    <RotateCcw className="size-3.5" />
                    <span className="sr-only sm:not-sr-only">
                        Demo zurücksetzen
                    </span>
                </Button>
            </div>
            <div
                role="status"
                aria-live="polite"
                className={cn(
                    "shrink-0 text-xs",
                    notice
                        ? "rounded-md border bg-muted/30 px-3 py-2"
                        : "sr-only",
                )}
            >
                {notice}
            </div>

            <Sheet
                open={!!detail}
                onOpenChange={(open) => {
                    if (!open) setDetailId(null);
                }}
            >
                <SheetContent
                    showCloseButton={false}
                    className="w-full overflow-y-auto sm:max-w-xl"
                >
                    <SheetHeader className="border-b">
                        <div className="flex items-center justify-between gap-3">
                            <Badge variant="info-light">Demo-Detail</Badge>
                            <SheetClose
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="Details schließen"
                                    />
                                }
                            >
                                <X />
                            </SheetClose>
                        </div>
                        <SheetTitle className="pr-5 text-lg">
                            {detail ? config.detailTitle(detail) : "Details"}
                        </SheetTitle>
                        <SheetDescription>
                            Beispieldatensatz · Stand 18. November 2026
                        </SheetDescription>
                    </SheetHeader>
                    {detail && (
                        <div className="px-6">
                            {config.renderDetail(detail)}
                        </div>
                    )}
                    <SheetFooter className="border-t">
                        {detail &&
                            config.actions?.map((action) => (
                                <Button
                                    key={action.id}
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        !!action.eligible &&
                                        !action.eligible(detail)
                                    }
                                    onClick={() => runAction(action, [detail])}
                                >
                                    {action.label}
                                </Button>
                            ))}
                        <SheetClose
                            render={
                                <Button type="button" variant="secondary" />
                            }
                        >
                            Schließen
                        </SheetClose>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ansicht speichern</DialogTitle>
                        <DialogDescription>
                            Filter, Sortierung und Spalten in diesem Browser
                            speichern. Die Demo-Daten werden nicht gespeichert.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (!viewName.trim()) return;
                            const view: SavedEnterpriseView = {
                                id: `saved:${Date.now()}`,
                                label: viewName.trim(),
                                state: {
                                    search,
                                    query,
                                    sorting,
                                    groupBy,
                                    visibility,
                                    density,
                                    columnOrder,
                                    pinning,
                                },
                            };
                            const next = [...savedViews, view];
                            if (saveEnterpriseViews(config.id, next)) {
                                setSavedViews(next);
                                setActiveView(view.id);
                                setSaveOpen(false);
                                setNotice(
                                    `Ansicht „${view.label}“ gespeichert.`,
                                );
                            } else
                                setSaveError(
                                    "Die Ansicht konnte nicht gespeichert werden. Bitte Browser-Speicher prüfen (maximal 12 Ansichten).",
                                );
                        }}
                        className="flex flex-col gap-4"
                    >
                        <label className="flex flex-col gap-2 text-sm font-medium">
                            Name der Ansicht
                            <Input
                                autoFocus
                                value={viewName}
                                required
                                maxLength={60}
                                onChange={(event) =>
                                    setViewName(event.target.value)
                                }
                                placeholder="Zum Beispiel: Offene Posten Berlin"
                            />
                        </label>
                        {saveError && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {saveError}
                            </p>
                        )}
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setSaveOpen(false)}
                            >
                                Abbrechen
                            </Button>
                            <Button type="submit" disabled={!viewName.trim()}>
                                <Save className="size-4" />
                                Speichern
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function EnterpriseRowActions<T extends EnterpriseRecord>({
    record,
    config,
    onOpen,
    onAction,
}: {
    record: T;
    config: EnterpriseModuleConfig<T>;
    onOpen: () => void;
    onAction: (action: EnterpriseAction<T>, targets: readonly T[]) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Aktionen für ${config.detailTitle(record)}`}
                    />
                }
            >
                <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onOpen}>
                    <Eye className="size-4" />
                    Details ansehen
                </DropdownMenuItem>
                {config.actions?.map((action) => (
                    <DropdownMenuItem
                        key={action.id}
                        disabled={!!action.eligible && !action.eligible(record)}
                        onClick={() => onAction(action, [record])}
                    >
                        {action.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function EnterpriseTotals<T extends EnterpriseRecord>({
    config,
    rows,
    label,
}: {
    config: EnterpriseModuleConfig<T>;
    rows: readonly T[];
    label: string;
}) {
    const { table, props } = useDataGrid<EnterpriseDisplayRow<T>>();
    const start = table.getStartVisibleLeafColumns();
    const center = table.getCenterVisibleLeafColumns();
    const end = table.getEndVisibleLeafColumns();
    const renderCell = (
        column: Column<DataGridFeatures, EnterpriseDisplayRow<T>, unknown>,
    ) => {
        const definition = config.columns.find(
            (entry) => entry.id === column.id,
        );
        const aggregate = definition?.aggregate?.(rows);
        return (
            <td
                key={column.id}
                style={
                    props.tableLayout?.columnsPinnable
                        ? getPinningStyles(column)
                        : undefined
                }
                className={cn(
                    "border-t bg-muted px-3 py-3 align-middle",
                    definition?.align === "right" && "text-right",
                )}
            >
                {definition?.primary ? (
                    <div>
                        <div className="text-xs font-semibold text-foreground">
                            {label}
                        </div>
                        <div className="text-[11px] font-normal text-muted-foreground">
                            {rows.length} {config.itemLabel} ·{" "}
                            {label === "Auswahl"
                                ? "ausgewählt"
                                : "alle Treffer"}
                        </div>
                    </div>
                ) : aggregate !== undefined ? (
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-normal text-muted-foreground">
                            {definition?.label}
                        </span>
                        <div
                            data-testid={`total-${label === "Auswahl" ? "selected" : "filtered"}-${column.id}`}
                            className="text-xs font-semibold tabular-nums"
                        >
                            {definition?.renderAggregate?.(aggregate, rows) ??
                                aggregate.toLocaleString("de-DE")}
                        </div>
                    </div>
                ) : null}
            </td>
        );
    };
    const filler = (
        <td key="filler" aria-hidden="true" className="border-t bg-muted" />
    );
    return (
        <tr data-slot="enterprise-total-row">
            {[...start, ...center].map(renderCell)}
            {end.length > 0 ? filler : null}
            {end.map(renderCell)}
            {end.length === 0 ? filler : null}
        </tr>
    );
}
