import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import {
    useTable,
    type ColumnDef,
    type ColumnPinningState,
} from "@tanstack/react-table";
import { Columns3, Pencil, Plus, Search, X } from "lucide-react";
import { CollectionKpis } from "@/components/blocks/collection-kpis";
import { GridCellSkeleton } from "@/components/blocks/collection-loading";
import { EmptyState, ErrorState } from "@/components/blocks/content";
import { PageHeader } from "@/components/blocks/layout";
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridColumnVisibility } from "@/components/reui/data-grid/data-grid-column-visibility";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCollectionSummary } from "@/framework/data/hooks";
import { useGridI18n } from "@/framework/i18n";
import { readPanels } from "@/framework/navigation/panels";
import { access, can, usePermissionRevision } from "@/framework/permissions";
import { CellRenderer } from "@/framework/tables/cell-renderer";
import { recordValue } from "@/framework/tables/cell-value";
import { ResourceFilters } from "@/framework/tables/resource-filters";
import { RowActions } from "@/framework/tables/resource-collection";
import { useResourceTable } from "@/framework/tables/use-resource-table";
import type {
    RecordData,
    ResourceDefinition,
    ResourceInstance,
} from "@/framework/types";
import { useWorkbench } from "@/framework/workbench";
import { useIsMobile } from "@/hooks/use-mobile";
import { isRowActivationEvent } from "@/lib/row-interaction";
import { cn } from "@/lib/utils";

const EMPTY_ROWS: RecordData[] = [];
const DEFAULT_SORT = { initial: [{ id: "code", desc: false }] };
const PAGINATION = { mode: "server" as const, pageSize: 10 };

/** One property per row; list, filters, totals and edits share the REST resource. */
export function PropertyCollection({
    resource,
}: {
    resource: ResourceDefinition;
}) {
    const i18n = useGridI18n();
    const mobile = useIsMobile();
    const navigate = useNavigate();
    const location = useLocation();
    const workbench = useWorkbench();
    const permissionRevision = usePermissionRevision();
    const controller = useResourceTable({
        resource,
        views: false,
        pagination: PAGINATION,
        sorters: DEFAULT_SORT,
        filterable: true,
        groupable: false,
        toolbarFilters: [],
    });
    const { state, update, result, filterDefinitions, clearQuery } = controller;
    const { search, filters, sorting, pagination, columnVisibility } = state;
    const summary = useCollectionSummary(resource, {
        query: controller.scopedQuery,
        filters: controller.apiFilters,
    });
    const rows = result.data?.data ?? EMPTY_ROWS;
    const staleRows = result.isPlaceholderData || controller.query !== search;
    const [pinning, setPinning] = useState<ColumnPinningState>({
        start: [],
        end: [],
    });
    const viewport = useRef<HTMLDivElement>(null);
    const pendingNavigation = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const hasQuery = !!search.trim() || Object.keys(filters).length > 0;

    useEffect(() => {
        if (!result.isFetching && result.data && controller.query === search) {
            const lastPage = Math.max(
                0,
                Math.ceil(result.data.total / pagination.pageSize) - 1,
            );
            if (pagination.pageIndex > lastPage) {
                update("pagination", (current) => ({
                    ...current,
                    pageIndex: lastPage,
                }));
            }
        }
    }, [
        result.data,
        result.isFetching,
        controller.query,
        search,
        pagination.pageIndex,
        pagination.pageSize,
    ]);

    useEffect(() => {
        if (pendingNavigation.current) clearTimeout(pendingNavigation.current);
        const scroll = viewport.current?.querySelector<HTMLElement>(
            '[data-slot="scroll-area-viewport"]',
        );
        if (scroll) scroll.scrollTop = 0;
        return () => {
            if (pendingNavigation.current)
                clearTimeout(pendingNavigation.current);
        };
    }, [
        controller.query,
        JSON.stringify(filters),
        JSON.stringify(sorting),
        pagination.pageIndex,
        pagination.pageSize,
    ]);

    // Also re-evaluate the active server filter after saving a sheet restored from its URL.
    const editing = readPanels(location.search).some(
        (panel) => panel.resource === resource.name && panel.mode !== "view",
    );
    const wasEditing = useRef(editing);
    useEffect(() => {
        const closed = wasEditing.current && !editing;
        wasEditing.current = editing;
        if (closed && result.isStale) void result.refetch();
    }, [editing, result.isStale, result.refetch]);

    const openEdit = (row: RecordData) => {
        if (staleRows || !can(resource.name, "edit", row)) return;
        workbench.openForm({
            resource,
            mode: "edit",
            row,
            presentation: "sheet",
        });
    };
    const instance: Partial<ResourceInstance> = {
        openForm: (request) =>
            workbench.openForm({ ...request, presentation: "sheet" }),
        reload: async () => {
            await Promise.all([result.refetch(), summary.refetch()]);
        },
    };
    const live = useRef({ openEdit, instance });
    live.current = { openEdit, instance };
    const columns = useMemo<ColumnDef<DataGridFeatures, RecordData>[]>(
        () => [
            ...resource.columns.map(
                (column): ColumnDef<DataGridFeatures, RecordData> => ({
                    id: column.field,
                    accessorFn: (row: RecordData) =>
                        recordValue(row, column.field),
                    size: typeof column.size === "number" ? column.size : 160,
                    minSize: column.minSize ?? 100,
                    maxSize: column.maxSize ?? 480,
                    enableSorting: column.sortable !== false,
                    enableHiding: column.hideable !== false,
                    meta: {
                        headerTitle: column.label,
                        cellClassName: ["number", "currency"].includes(
                            column.kind ?? "",
                        )
                            ? "text-right tabular-nums"
                            : undefined,
                        skeleton: <GridCellSkeleton dense kind={column.kind} />,
                    },
                    header: ({ column: tableColumn }) => (
                        <DataGridColumnHeader
                            column={tableColumn}
                            title={column.label}
                        />
                    ),
                    cell: ({ row }) => (
                        <div
                            className={cn(
                                "min-w-0",
                                column.field === resource.titleField &&
                                    "font-medium",
                            )}
                        >
                            {recordValue(row.original, column.field) == null ||
                            recordValue(row.original, column.field) === "" ? (
                                <span
                                    className="text-muted-foreground"
                                    title="Nicht erfasst"
                                >
                                    —
                                </span>
                            ) : (
                                <CellRenderer
                                    column={column}
                                    row={row.original}
                                />
                            )}
                        </div>
                    ),
                }),
            ),
            {
                id: "actions",
                header: "",
                size: 76,
                minSize: 76,
                maxSize: 76,
                enableSorting: false,
                enableHiding: false,
                enableResizing: false,
                enablePinning: false,
                meta: {
                    cellClassName: "text-right",
                    skeleton: <GridCellSkeleton dense kind="actions" />,
                },
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-0.5">
                        {can(resource.name, "edit", row.original) && (
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground"
                                aria-label={
                                    String(row.original[resource.titleField]) +
                                    " bearbeiten"
                                }
                                onClick={() =>
                                    live.current.openEdit(row.original)
                                }
                            >
                                <Pencil className="size-3.5" />
                            </Button>
                        )}
                        <RowActions
                            resource={resource}
                            row={row.original}
                            instance={live.current.instance}
                        />
                    </div>
                ),
            },
        ],
        [resource, permissionRevision],
    );
    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: rows,
        getRowId: (row) => String(row.id),
        manualPagination: true,
        manualFiltering: true,
        manualSorting: true,
        rowCount: result.data?.total ?? 0,
        state: {
            pagination,
            sorting,
            columnVisibility,
            columnPinning: pinning,
        },
        onPaginationChange: (next) => update("pagination", next),
        onSortingChange: controller.setSorters,
        onColumnVisibilityChange: (next) => update("columnVisibility", next),
        onColumnPinningChange: setPinning,
    });
    const openRecord = (row: RecordData) => {
        const permission = access(resource.name, "view", row);
        if (staleRows || (!permission.allowed && !permission.pending)) return;
        if (pendingNavigation.current) clearTimeout(pendingNavigation.current);
        pendingNavigation.current = setTimeout(() => {
            pendingNavigation.current = null;
            navigate("/" + resource.name + "/" + row.id);
        }, 220);
    };
    const renderToolbar = (trigger: ReactNode, activeFilters: ReactNode) => (
        <div
            data-slot="property-toolbar"
            className="flex shrink-0 flex-col gap-3 px-4 py-3"
        >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="relative min-w-32 max-w-80 flex-1 basis-40">
                    <Search
                        aria-hidden
                        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        aria-label="Objekte durchsuchen"
                        placeholder="Objekte durchsuchen …"
                        value={search}
                        maxLength={200}
                        onChange={(event) =>
                            update("search", event.target.value, true)
                        }
                        className="bg-card pl-8 pr-8"
                    />
                    {search && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Suche leeren"
                            className="absolute right-1 top-1/2 -translate-y-1/2"
                            onClick={() => update("search", "", true)}
                        >
                            <X />
                        </Button>
                    )}
                </div>
                {trigger}
                <div className="ml-auto">
                    <DataGridColumnVisibility
                        table={table}
                        trigger={
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground"
                                aria-label="Spalten"
                            >
                                <Columns3 className="size-3.5" />
                                <span className="hidden sm:inline">
                                    Spalten
                                </span>
                            </Button>
                        }
                    />
                </div>
            </div>
            {activeFilters}
        </div>
    );

    return (
        <>
            <div className="shrink-0">
                <PageHeader
                    title="Objekte"
                    description="Objektbestand, Verwaltung und Einheiten im Überblick."
                    actions={
                        can(resource.name, "create") && (
                            <Button
                                onClick={() =>
                                    workbench.openForm({
                                        resource,
                                        mode: "create",
                                        presentation: "sheet",
                                        wizard: true,
                                    })
                                }
                            >
                                <Plus /> Objekt anlegen
                            </Button>
                        )
                    }
                />
            </div>
            {resource.summary && (
                <Card className="shrink-0 gap-0 p-0">
                    <CollectionKpis
                        definition={resource.summary}
                        values={summary.data?.data}
                        loading={summary.isPending}
                        refreshing={summary.isFetching}
                        error={summary.error}
                        retry={() => void summary.refetch()}
                    />
                </Card>
            )}
            <Card
                data-slot="property-grid"
                ref={viewport}
                className="relative min-h-0 min-w-0 flex-1 gap-0 p-0"
                aria-busy={result.isFetching}
                onDoubleClick={(event) => {
                    if (staleRows || !isRowActivationEvent(event, true)) return;
                    const id = (event.target as Element).closest<HTMLElement>(
                        "tr[data-row-id]",
                    )?.dataset.rowId;
                    const row = rows.find((record) => String(record.id) === id);
                    if (row) {
                        if (pendingNavigation.current)
                            clearTimeout(pendingNavigation.current);
                        pendingNavigation.current = null;
                        openEdit(row);
                    }
                }}
            >
                <DataGrid
                    table={table}
                    i18n={i18n}
                    recordCount={result.data?.total ?? 0}
                    isLoading={result.isPending}
                    loadingMode="skeleton"
                    onRowClick={openRecord}
                    tableLayout={{
                        width: "fixed",
                        dense: true,
                        cellBorder: false,
                        rowBorder: true,
                        headerBackground: false,
                        headerSticky: true,
                        columnsResizable: true,
                        columnsPinnable: !mobile,
                        columnsMovable: true,
                        columnsVisibility: true,
                    }}
                    emptyMessage={
                        <EmptyState
                            title={
                                hasQuery
                                    ? "Keine passenden Objekte"
                                    : "Noch keine Objekte"
                            }
                            description={
                                hasQuery
                                    ? "Passe die Suche oder die Filter an."
                                    : "Lege das erste Objekt deines Bestands an."
                            }
                            action={
                                hasQuery && (
                                    <Button
                                        variant="outline"
                                        onClick={clearQuery}
                                    >
                                        Suche und Filter zurücksetzen
                                    </Button>
                                )
                            }
                        />
                    }
                >
                    <ResourceFilters
                        definitions={filterDefinitions}
                        value={filters}
                        onChange={(next) => update("filters", next, true)}
                        renderToolbar={renderToolbar}
                    />
                    {result.isFetching && !result.isPending && (
                        <div
                            role="status"
                            aria-label="Objekte werden aktualisiert"
                            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 animate-pulse bg-primary/40"
                        />
                    )}
                    {result.isError ? (
                        <div className="min-h-0 flex-1 overflow-auto">
                            <ErrorState
                                error={result.error}
                                retry={() => void result.refetch()}
                            />
                        </div>
                    ) : (
                        <>
                            <div
                                data-slot="property-grid-scroll"
                                className={cn(
                                    "min-h-0 flex-1 border-t",
                                    staleRows && "opacity-60",
                                )}
                                inert={staleRows}
                            >
                                <DataGridContainer className="h-full [&>div]:h-full">
                                    <DataGridScrollArea className="h-full">
                                        <DataGridTable />
                                    </DataGridScrollArea>
                                </DataGridContainer>
                            </div>
                            <div className="shrink-0 border-t px-4 py-2.5">
                                <DataGridPagination
                                    compact={mobile}
                                    sizes={[10, 25, 50, 100]}
                                    info="{from}–{to} von {count}"
                                />
                            </div>
                        </>
                    )}
                </DataGrid>
            </Card>
        </>
    );
}
