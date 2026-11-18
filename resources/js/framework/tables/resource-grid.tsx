import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import {
    useTable,
    type ColumnDef,
    type ColumnPinningState,
} from "@tanstack/react-table";
import {
    ChevronDown,
    ChevronRight,
    Layers3,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    X,
} from "lucide-react";
import { CollectionKpis } from "@/components/blocks/collection-kpis";
import { GridCellSkeleton } from "@/components/blocks/collection-loading";
import { EmptyState, ErrorState } from "@/components/blocks/content";
import { PageHeader } from "@/components/blocks/layout";
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    useDataGrid,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import {
    DataGridTable,
    getPinningStyles,
} from "@/components/reui/data-grid/data-grid-table";
import { DataGridTableVirtual } from "@/components/reui/data-grid/data-grid-table-virtual";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCollectionSummary } from "../data/hooks";
import { useInfiniteResourceList } from "../data/infinite";
import { useGridI18n } from "../i18n";
import { readPanels } from "../navigation/panels";
import { access, can, usePermissionRevision } from "../permissions";
import type {
    CellDraftValues,
    CollectionOptions,
    Filter,
    RecordData,
    ResourceDefinition,
    ResourceInstance,
} from "../types";
import { useWorkbench } from "../workbench";
import { useIsMobile } from "@/hooks/use-mobile";
import { isRowActivationEvent } from "@/lib/row-interaction";
import { cn } from "@/lib/utils";
import { CellRenderer } from "./cell-renderer";
import { evaluateColumn } from "./column-calculations";
import { ResourceColumnChooser } from "./resource-column-chooser";
import { ResourceGridCell } from "./resource-grid-cell";
import {
    aggregateGridColumn,
    draftRowKey,
    resourceGridRows,
    type ResourceGridRow,
} from "./resource-grid-model";
import { ResourceFilters } from "./resource-filters";
import { RowActions } from "./resource-collection";
import { useResourceTable } from "./use-resource-table";

const EMPTY_ROWS: RecordData[] = [];
const DEFAULT_PAGINATION = { mode: "server" as const, pageSize: 10 };

export interface ResourceGridProps extends CollectionOptions {
    resource: ResourceDefinition;
    fixedFilters?: Filter[];
    urlKey?: string;
    header?: boolean;
    description?: string;
    /** Keeps existing application slots stable while consumers migrate to the shared grid. */
    slotPrefix?: string;
}

/** ReUI presentation of the existing resource/provider/workbench contract. */
export function ResourceGrid(props: ResourceGridProps) {
    return (
        <ResourceGridWorkspace
            key={JSON.stringify([
                props.resource.dataProvider ?? "default",
                props.resource.name,
            ])}
            {...props}
        />
    );
}

function ResourceGridWorkspace({
    resource: definition,
    fixedFilters,
    urlKey,
    header = true,
    description = definition.description,
    slotPrefix = "resource",
    pagination: paginationConfig = definition.collection?.pagination ??
        DEFAULT_PAGINATION,
    infiniteScroll = definition.collection?.infiniteScroll ?? false,
    previewColumns = definition.collection?.previewColumns,
    searchable = definition.collection?.searchable ?? true,
    filterable = definition.collection?.filterable ?? true,
    groupable = definition.collection?.groupable ?? true,
    sorters = definition.collection?.sorters,
    filters: filterPresets = definition.collection?.filters,
    queryOptions = definition.collection?.queryOptions,
    syncWithLocation = definition.collection?.syncWithLocation ?? true,
    summary: showSummary = definition.collection?.summary ?? true,
    create: creatable = definition.collection?.create ?? true,
    detailLink = definition.collection?.detailLink ?? true,
    actions = definition.collection?.actions,
    doubleClickEdit = definition.collection?.doubleClickEdit ?? true,
    resizable = definition.collection?.resizable ?? true,
    pinnable = definition.collection?.pinnable ?? true,
    columnChooser = definition.collection?.columnChooser ?? true,
    toolbar = definition.collection?.toolbar ?? true,
}: ResourceGridProps) {
    const resource = useMemo(
        () =>
            previewColumns?.length
                ? {
                      ...definition,
                      columns: [
                          ...definition.columns,
                          ...previewColumns.filter(
                              (column) =>
                                  !definition.columns.some(
                                      (base) => base.field === column.field,
                                  ),
                          ),
                      ],
                  }
                : definition,
        [definition, previewColumns],
    );
    const i18n = useGridI18n();
    const mobile = useIsMobile();
    const navigate = useNavigate();
    const location = useLocation();
    const workbench = useWorkbench();
    const permissionRevision = usePermissionRevision();
    const controller = useResourceTable({
        resource,
        fixedFilters,
        urlKey,
        views: false,
        pagination: infiniteScroll
            ? {
                  ...(typeof paginationConfig === "object"
                      ? paginationConfig
                      : DEFAULT_PAGINATION),
                  mode: "server",
              }
            : paginationConfig,
        sorters,
        filters: filterPresets,
        queryOptions,
        searchable,
        filterable,
        groupable,
        syncWithLocation,
        toolbarFilters: [],
        listEnabled: !infiniteScroll,
    });
    const {
        state,
        update,
        filterDefinitions,
        clearQuery,
        groupResult,
        effectiveGroup,
    } = controller;
    const { search, filters, sorting, pagination, columnVisibility } = state;
    const infinite = useInfiniteResourceList(
        resource,
        {
            query: controller.scopedQuery,
            filters: controller.apiFilters,
            sort: controller.sort,
            limit: pagination.pageSize,
        },
        {
            ...queryOptions,
            enabled: infiniteScroll && (queryOptions?.enabled ?? true),
        },
    );
    const result = infiniteScroll ? infinite : controller.result;
    const rows = infiniteScroll
        ? infinite.records
        : (controller.result.data?.data ?? EMPTY_ROWS);
    const total = infiniteScroll
        ? infinite.total
        : (controller.result.data?.total ?? 0);
    const staleRows =
        (!infiniteScroll && controller.result.isPlaceholderData) ||
        controller.query !== search;
    const summary = useCollectionSummary(
        resource,
        {
            query: controller.scopedQuery,
            filters: controller.apiFilters,
        },
        showSummary && (queryOptions?.enabled ?? true),
    );
    const [pinning, setPinning] = useState<ColumnPinningState>({
        start: [],
        end: [],
    });
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Record<string, CellDraftValues>>({});
    const viewport = useRef<HTMLDivElement>(null);
    const pendingNavigation = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const hasQuery = !!search.trim() || Object.keys(filters).length > 0;
    const scope = JSON.stringify([
        resource.name,
        resource.dataProvider,
        controller.scopedQuery,
        controller.apiFilters,
        controller.sort,
    ]);

    useEffect(() => {
        setCollapsed(new Set());
    }, [scope]);
    useEffect(() => {
        if (
            (infiniteScroll || !controller.paginationEnabled) &&
            pagination.pageIndex !== 0
        )
            update("pagination", (current) => ({ ...current, pageIndex: 0 }));
    }, [infiniteScroll, controller.paginationEnabled, pagination.pageIndex]);
    useEffect(() => {
        if (
            infiniteScroll ||
            !controller.paginationEnabled ||
            result.isFetching ||
            !controller.result.data ||
            controller.query !== search
        )
            return;
        const lastPage = Math.max(
            0,
            Math.ceil(total / pagination.pageSize) - 1,
        );
        if (pagination.pageIndex > lastPage)
            update("pagination", (current) => ({
                ...current,
                pageIndex: lastPage,
            }));
    }, [
        infiniteScroll,
        total,
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
    }, [scope, pagination.pageIndex, pagination.pageSize, infiniteScroll]);

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
            await Promise.all([
                result.refetch(),
                ...(showSummary && resource.summary ? [summary.refetch()] : []),
                ...(effectiveGroup !== "none" ? [groupResult.refetch()] : []),
            ]);
        },
    };
    const live = useRef({ openEdit, instance, staleRows });
    live.current = { openEdit, instance, staleRows };
    const displayRows = useMemo(
        () =>
            resourceGridRows(
                rows,
                effectiveGroup,
                groupResult.isError ? undefined : groupResult.data?.groups,
                resource,
                collapsed,
                drafts,
            ),
        [
            rows,
            effectiveGroup,
            groupResult.data,
            groupResult.isError,
            resource,
            collapsed,
            drafts,
        ],
    );
    const toggleGroup = (id: string) =>
        setCollapsed((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const columns = useMemo<ColumnDef<DataGridFeatures, ResourceGridRow>[]>(
        () => [
            ...resource.columns.map(
                (definition): ColumnDef<DataGridFeatures, ResourceGridRow> => ({
                    id: definition.field,
                    accessorFn: (entry) =>
                        entry.kind === "record"
                            ? evaluateColumn(
                                  entry.record,
                                  definition,
                                  resource.columns,
                                  entry.drafts[draftRowKey(entry.record)],
                              )
                            : entry.label,
                    size:
                        typeof definition.size === "number"
                            ? definition.size
                            : 160,
                    minSize: definition.minSize ?? 100,
                    maxSize: definition.maxSize ?? 480,
                    enableSorting:
                        definition.sortable !== false &&
                        !definition.computed &&
                        (!definition.input ||
                            (definition.input.mode === "record" &&
                                resource.fields.some(
                                    (field) => field.name === definition.field,
                                ))),
                    enableHiding: definition.hideable !== false,
                    meta: {
                        headerTitle: definition.label,
                        cellClassName: [
                            "number",
                            "currency",
                            "percent",
                        ].includes(definition.kind ?? "")
                            ? "text-right tabular-nums"
                            : undefined,
                        skeleton: (
                            <GridCellSkeleton dense kind={definition.kind} />
                        ),
                    },
                    header: ({ column }) => (
                        <DataGridColumnHeader
                            column={column}
                            title={definition.label}
                            grouping={
                                groupable &&
                                resource.groupBy?.some(
                                    (group) => group.value === definition.field,
                                )
                                    ? {
                                          active:
                                              effectiveGroup ===
                                              definition.field,
                                          onToggle: () =>
                                              update(
                                                  "group",
                                                  effectiveGroup ===
                                                      definition.field
                                                      ? "none"
                                                      : definition.field,
                                                  true,
                                              ),
                                      }
                                    : undefined
                            }
                        />
                    ),
                    cell: ({ row, table }) => {
                        const entry = row.original;
                        if (entry.kind === "group") {
                            const firstVisibleColumn = [
                                ...table.getStartVisibleLeafColumns(),
                                ...table.getCenterVisibleLeafColumns(),
                                ...table.getEndVisibleLeafColumns(),
                            ][0]?.id;
                            const value = aggregateGridColumn(
                                entry.records,
                                definition,
                                resource.columns,
                                entry.drafts,
                            );
                            return (
                                <div className="space-y-1">
                                    {definition.field ===
                                        firstVisibleColumn && (
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 py-1 text-left font-medium"
                                            aria-expanded={
                                                !collapsed.has(entry.id)
                                            }
                                            aria-label={`${entry.label}: ${collapsed.has(entry.id) ? "aufklappen" : "zuklappen"}`}
                                            onClick={() =>
                                                toggleGroup(entry.id)
                                            }
                                        >
                                            {collapsed.has(entry.id) ? (
                                                <ChevronRight className="size-3.5 shrink-0" />
                                            ) : (
                                                <ChevronDown className="size-3.5 shrink-0" />
                                            )}
                                            <span className="min-w-0">
                                                <span className="block truncate">
                                                    {entry.label}
                                                </span>
                                                <span className="block text-[11px] font-normal text-muted-foreground">
                                                    {entry.records.length}{" "}
                                                    {infiniteScroll
                                                        ? "geladen"
                                                        : "auf Seite"}{" "}
                                                    · {entry.total} gesamt
                                                </span>
                                            </span>
                                        </button>
                                    )}
                                    {value != null && (
                                        <div
                                            className="font-medium"
                                            title={
                                                infiniteScroll
                                                    ? "Aggregat der geladenen Gruppenzeilen"
                                                    : "Aggregat der Gruppenzeilen auf dieser Seite"
                                            }
                                        >
                                            <CellRenderer
                                                column={{
                                                    field: "total",
                                                    label: definition.label,
                                                    kind: definition.kind,
                                                }}
                                                row={{
                                                    id: -1,
                                                    updated_at: "",
                                                    total: value,
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        return (
                            <div
                                className={cn(
                                    "min-w-0",
                                    definition.field === resource.titleField &&
                                        "font-medium",
                                )}
                            >
                                <ResourceGridCell
                                    resource={resource}
                                    row={entry.record}
                                    column={definition}
                                    columns={resource.columns}
                                    draft={
                                        entry.drafts[draftRowKey(entry.record)]
                                    }
                                    disabled={staleRows}
                                    onDraftChange={(field, value) =>
                                        setDrafts((previous) => ({
                                            ...previous,
                                            [draftRowKey(entry.record)]: {
                                                ...previous[
                                                    draftRowKey(entry.record)
                                                ],
                                                [field]: value,
                                            },
                                        }))
                                    }
                                />
                            </div>
                        );
                    },
                }),
            ),
            ...(actions === false
                ? []
                : [
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
                              skeleton: (
                                  <GridCellSkeleton dense kind="actions" />
                              ),
                          },
                          cell: ({ row }) =>
                              row.original.kind === "record" && (
                                  <div className="flex items-center justify-end gap-0.5">
                                      {can(
                                          resource.name,
                                          "edit",
                                          row.original.record,
                                      ) &&
                                          (!actions ||
                                              actions.includes("edit")) && (
                                              <Button
                                                  variant="ghost"
                                                  size="icon-sm"
                                                  className="text-muted-foreground"
                                                  aria-label={`${String(row.original.record[resource.titleField])} bearbeiten`}
                                                  onClick={() => {
                                                      if (
                                                          row.original.kind ===
                                                          "record"
                                                      )
                                                          live.current.openEdit(
                                                              row.original
                                                                  .record,
                                                          );
                                                  }}
                                              >
                                                  <Pencil className="size-3.5" />
                                              </Button>
                                          )}
                                      <RowActions
                                          resource={resource}
                                          row={row.original.record}
                                          instance={live.current.instance}
                                          allowed={actions}
                                      />
                                  </div>
                              ),
                      } satisfies ColumnDef<DataGridFeatures, ResourceGridRow>,
                  ]),
        ],
        [
            resource,
            permissionRevision,
            groupable,
            effectiveGroup,
            collapsed,
            infiniteScroll,
            actions,
            staleRows,
        ],
    );
    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: displayRows,
        getRowId: (row) => row.id,
        manualPagination: true,
        manualFiltering: true,
        manualSorting: true,
        rowCount: total,
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
    const openRecord = (entry: ResourceGridRow) => {
        if (entry.kind !== "record" || !detailLink) return;
        const row = entry.record;
        const permission = access(resource.name, "view", row);
        if (staleRows || (!permission.allowed && !permission.pending)) return;
        if (pendingNavigation.current) clearTimeout(pendingNavigation.current);
        pendingNavigation.current = setTimeout(() => {
            pendingNavigation.current = null;
            navigate(`/${resource.name}/${row.id}`);
        }, 220);
    };
    const fetchMore = () => {
        if (
            infiniteScroll &&
            !staleRows &&
            infinite.hasNextPage &&
            !infinite.isFetching &&
            !infinite.isFetchNextPageError
        )
            void infinite.fetchNextPage({ cancelRefetch: false });
    };
    const renderToolbar = (trigger: ReactNode, activeFilters: ReactNode) => (
        <div
            data-slot={`${slotPrefix}-toolbar`}
            className="flex shrink-0 flex-col gap-3 px-4 py-3"
        >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                {searchable && (
                    <div className="relative min-w-32 max-w-80 flex-1 basis-40">
                        <Search
                            aria-hidden
                            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            aria-label={`${resource.label} durchsuchen`}
                            placeholder={`${resource.label} durchsuchen …`}
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
                )}
                {filterable && trigger}
                <div className="ml-auto flex items-center gap-2">
                    {Object.keys(drafts).length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            aria-label="Vorschau zurücksetzen"
                            onClick={() => setDrafts({})}
                        >
                            <RotateCcw className="size-3.5" />
                            <span className="hidden sm:inline">
                                Vorschau zurücksetzen
                            </span>
                        </Button>
                    )}
                    {columnChooser && (
                        <ResourceColumnChooser
                            resource={resource}
                            table={table}
                        />
                    )}
                </div>
            </div>
            {activeFilters}
            {effectiveGroup !== "none" && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="gap-1.5 font-normal">
                        <Layers3 className="size-3" />
                        Gruppiert nach{" "}
                        {
                            resource.groupBy?.find(
                                (group) => group.value === effectiveGroup,
                            )?.label
                        }
                        <button
                            aria-label="Gruppierung aufheben"
                            onClick={() => update("group", "none", true)}
                        >
                            <X className="size-3" />
                        </button>
                    </Badge>
                    <span>
                        {infiniteScroll
                            ? "Gruppensummen: geladene Zeilen"
                            : "Gruppensummen: aktuelle Seite"}
                    </span>
                    {groupResult.isPending && (
                        <span role="status">Gruppen werden geladen …</span>
                    )}
                </div>
            )}
        </div>
    );
    const totals = resource.columns.some((column) => column.aggregate) ? (
        <ResourceGridTotals
            resource={resource}
            rows={rows}
            drafts={drafts}
            label={
                infiniteScroll
                    ? "Geladene Zeilen"
                    : controller.paginationMode === "off"
                      ? "Gesamte Auswahl"
                      : "Aktuelle Seite"
            }
        />
    ) : undefined;

    return (
        <>
            {header && (
                <div className="shrink-0">
                    <PageHeader
                        title={resource.label}
                        description={description}
                        actions={
                            creatable &&
                            can(resource.name, "create") && (
                                <Button
                                    onClick={() =>
                                        workbench.openForm({
                                            resource,
                                            mode: "create",
                                            presentation: "sheet",
                                            wizard: !!resource.groups,
                                        })
                                    }
                                >
                                    <Plus />
                                    {resource.singular} anlegen
                                </Button>
                            )
                        }
                    />
                </div>
            )}
            {showSummary && resource.summary && (
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
                data-slot={`${slotPrefix}-grid`}
                ref={viewport}
                className="relative min-h-0 min-w-0 flex-1 gap-0 p-0"
                aria-busy={result.isFetching}
                onDoubleClick={(event) => {
                    if (
                        !doubleClickEdit ||
                        staleRows ||
                        !isRowActivationEvent(event, true)
                    )
                        return;
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
                    recordCount={total}
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
                        columnsResizable: resizable,
                        columnsPinnable: pinnable && !mobile,
                        columnsMovable: true,
                        columnsVisibility: columnChooser,
                    }}
                    emptyMessage={
                        <EmptyState
                            title={
                                hasQuery
                                    ? `Keine passenden ${resource.label}`
                                    : `Noch keine ${resource.label}`
                            }
                            description={
                                hasQuery
                                    ? "Passe die Suche oder die Filter an."
                                    : "In diesem Bereich sind noch keine Datensätze vorhanden."
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
                    {toolbar && (
                        <ResourceFilters
                            definitions={filterDefinitions}
                            value={filters}
                            onChange={(next) => update("filters", next, true)}
                            renderToolbar={renderToolbar}
                        />
                    )}
                    {result.isFetching && !result.isPending && (
                        <div
                            role="status"
                            aria-label={`${resource.label} werden aktualisiert`}
                            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 animate-pulse bg-primary/40"
                        />
                    )}
                    {effectiveGroup !== "none" && groupResult.isError && (
                        <div
                            role="alert"
                            className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs"
                        >
                            Gruppen konnten nicht geladen werden. Die Datensätze
                            bleiben sichtbar.
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void groupResult.refetch()}
                            >
                                Erneut versuchen
                            </Button>
                        </div>
                    )}
                    {result.isError &&
                    !(infiniteScroll && infinite.isFetchNextPageError) ? (
                        <div className="min-h-0 flex-1 overflow-auto">
                            <ErrorState
                                error={result.error}
                                retry={() => void result.refetch()}
                            />
                        </div>
                    ) : (
                        <>
                            <div
                                data-slot={`${slotPrefix}-grid-scroll`}
                                className={cn(
                                    "min-h-0 flex-1 border-t",
                                    staleRows && "opacity-60",
                                )}
                                inert={staleRows}
                            >
                                <DataGridContainer className="h-full [&>div]:h-full">
                                    <DataGridScrollArea className="h-full">
                                        {infiniteScroll ? (
                                            <DataGridTableVirtual
                                                height="100%"
                                                estimateSize={40}
                                                overscan={6}
                                                fetchMoreOffset={3}
                                                onFetchMore={fetchMore}
                                                hasMore={infinite.hasNextPage}
                                                isFetchingMore={
                                                    infinite.isFetchingNextPage
                                                }
                                                footerContent={totals}
                                            />
                                        ) : (
                                            <DataGridTable
                                                footerContent={totals}
                                            />
                                        )}
                                    </DataGridScrollArea>
                                </DataGridContainer>
                            </div>
                            {infiniteScroll ? (
                                <div
                                    data-slot="resource-grid-load-more"
                                    className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground"
                                    aria-live="polite"
                                >
                                    <span>
                                        {rows.length.toLocaleString("de-DE")}{" "}
                                        von {total.toLocaleString("de-DE")}{" "}
                                        geladen
                                    </span>
                                    {infinite.isFetchNextPageError ? (
                                        <>
                                            <span role="alert">
                                                Weitere Zeilen konnten nicht
                                                geladen werden.
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    void infinite.fetchNextPage(
                                                        {
                                                            cancelRefetch: false,
                                                        },
                                                    )
                                                }
                                            >
                                                Erneut versuchen
                                            </Button>
                                        </>
                                    ) : (
                                        infinite.hasNextPage && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={
                                                    infinite.isFetching ||
                                                    staleRows
                                                }
                                                onClick={fetchMore}
                                            >
                                                {infinite.isFetchingNextPage
                                                    ? "Wird geladen …"
                                                    : "Weitere laden"}
                                            </Button>
                                        )
                                    )}
                                </div>
                            ) : (
                                controller.paginationEnabled && (
                                    <div className="shrink-0 border-t px-4 py-2.5">
                                        <DataGridPagination
                                            compact={mobile}
                                            sizes={[10, 25, 50, 100]}
                                            info="{from}–{to} von {count}"
                                        />
                                    </div>
                                )
                            )}
                        </>
                    )}
                </DataGrid>
            </Card>
        </>
    );
}

function ResourceGridTotals({
    resource,
    rows,
    drafts,
    label,
}: {
    resource: ResourceDefinition;
    rows: RecordData[];
    drafts: Record<string, CellDraftValues>;
    label: string;
}) {
    const { table, props } = useDataGrid<ResourceGridRow>();
    const columns = [
        ...table.getStartVisibleLeafColumns(),
        ...table.getCenterVisibleLeafColumns(),
        ...table.getEndVisibleLeafColumns(),
    ];
    const first = columns[0]?.id;
    const cells = columns.map((column) => {
        const definition = resource.columns.find(
            (entry) => entry.field === column.id,
        );
        const value = definition
            ? aggregateGridColumn(rows, definition, resource.columns, drafts)
            : null;
        return (
            <td
                key={column.id}
                style={
                    props.tableLayout?.columnsPinnable
                        ? getPinningStyles(column)
                        : undefined
                }
                className={cn(
                    "border-t bg-muted/50 px-3 py-2.5 text-xs font-medium",
                    definition?.aggregate && "text-right tabular-nums",
                )}
            >
                {column.id === first && (
                    <span className="block font-normal text-muted-foreground">
                        {label} · {rows.length}
                    </span>
                )}
                {value != null && definition && (
                    <CellRenderer
                        column={{
                            field: "total",
                            label: definition.label,
                            kind: definition.kind,
                        }}
                        row={{ id: -1, updated_at: "", total: value }}
                    />
                )}
            </td>
        );
    });
    const endCount = table.getEndVisibleLeafColumns().length;
    if (props.tableLayout?.columnsResizable)
        cells.splice(
            endCount ? cells.length - endCount : cells.length,
            0,
            <td key="filler" aria-hidden className="border-t bg-muted/50" />,
        );
    return <tr data-slot="resource-grid-totals">{cells}</tr>;
}
