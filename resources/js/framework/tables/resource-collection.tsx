import { useGridI18n, useI18n } from "../i18n";
import { usePermissionRevision } from "../permissions";
import { CellRenderer } from "./cell-renderer";
import { recordValue } from "./cell-value";
import { CollectionViews, collectionViewTabId } from "./collection-views";
import { DirectFilters, supportsDirectFilter } from "./direct-filters";
import { GridCellSkeleton } from "@/components/blocks/collection-loading";
import { resolveColumnLayout, stackRecordColumns } from "./column-layout";
import { ResponsiveRecordList } from "./responsive-record-list";
import { TableViewport } from "./table-viewport";
import { useLayoutEffect, useId } from "react";
import { CollectionSurface } from "@/components/blocks/collection-surface";
import { CollectionKpis } from "@/components/blocks/collection-kpis";
import { useCollectionSummary } from "../data/hooks";
import { BulkActionBar } from "@/components/blocks/bulk-action-bar";
import { ActionMenu, ActionButtons } from "../action-controls";
import type { ActionPlacement } from "../actions";
import { defaultColumnVisibility } from "./grid-state";
import { useResourceTable } from "./use-resource-table";
import { exportRows } from "./export";
import { cn } from "@/lib/utils";
import { isRowActivationEvent } from "@/lib/row-interaction";
import { Download, X, Ellipsis } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState } from "@/components/blocks/content";
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { ChoicePicker } from "@/components/fields/choice-picker";
import { ResourceFilters } from "./resource-filters";

import { DataGridTableVirtual } from "@/components/reui/data-grid/data-grid-table-virtual";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import {
    DataGridTable,
    DataGridTableRowSelect,
    DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { label } from "@/lib/format";
import {
    useTable,
    type ColumnDef,
    type RowSelectionState,
    type SortingState,
    type ColumnVisibilityState,
    type ColumnPinningState,
} from "@tanstack/react-table";
import { ListFilter, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useNavigate } from "react-router";
import { useReload } from "../data/hooks";
import { access, can } from "../permissions";
import type {
    Filter,
    CollectionOptions,
    RelationFormOptions,
    RecordData,
    ResourceDefinition,
    ResourceInstance,
    Values,
} from "../types";
import { useWorkbench } from "../workbench";
const EMPTY_ROWS: RecordData[] = [];
export function RowActions({
    resource,
    row,
    instance,
    exclude = [],
    allowed,
    placement = "row",
}: {
    resource: ResourceDefinition;
    row: RecordData;
    instance?: Partial<ResourceInstance>;
    exclude?: string[];
    allowed?: false | string[];
    placement?: ActionPlacement;
}) {
    return (
        <ActionMenu
            actions={resource.actions}
            target={{ resource, rows: [row], instance }}
            placement={placement}
            label={`Aktionen für ${String(row[resource.titleField])}`}
            exclude={exclude}
            allowed={allowed}
        />
    );
}
export function ResourceCollection({
    resource,
    fixedFilters = [],
    defaults,
    compact = false,
    onSaved,
    form,
    formResource,
    context,
    searchable = true,
    virtualized = "auto",
    pagination: paginationConfig = true,
    filters: filterPresets,
    sorters: sortPresets,
    queryOptions,
    selectAllFiltered: allowAllFiltered = true,
    rowSelection = "multiple",
    selectAll = true,
    doubleClickEdit = true,
    syncWithLocation = true,
    urlKey,
    resizable = true,
    pinnable = true,
    filterable = !compact,
    groupable = !compact,
    columnChooser = true,
    exportable = true,
    refreshable = true,
    toolbar = true,
    tabIcons = true,
    summary = !compact,
    views: configuredViews = compact ? false : resource.views,
    toolbarFilters: directFields = resource.toolbarFilters ?? [],
    viewMode = "page",
    actions,
    detailLink = true,
    create: creatable = true,
    createForm,
    editForm,
}: {
    resource: ResourceDefinition;
    fixedFilters?: Filter[];
    defaults?: Values;
    compact?: boolean;
    onSaved?: () => void | Promise<void>;
    form?: UseFormReturn<Values>;
    formResource?: ResourceDefinition;
    context?: import("../types").FormRequest["context"];
    urlKey?: string;
    createForm?: RelationFormOptions;
    editForm?: Omit<RelationFormOptions, "flow">;
} & CollectionOptions) {
    const i18n = useGridI18n();
    const { t } = useI18n();
    const navigate = useNavigate();
    const panelId = useId();
    const workbench = useWorkbench();
    const reload = useReload();
    const controller = useResourceTable({
        resource,
        fixedFilters,
        views: configuredViews,
        pagination: paginationConfig,
        filters: filterPresets,
        sorters: sortPresets,
        queryOptions,
        compact,
        syncWithLocation,
        urlKey,
        searchable,
        filterable,
        groupable,
        toolbarFilters: directFields,
    });
    const {
        state,
        update,
        clearQuery,
        query,
        activeView,
        views,
        scopedQuery,
        filterDefinitions,
        apiFilters,
        result,
        groupResult,
        effectiveGroup,
    } = controller;
    const paging = controller.paginationEnabled;
    const {
        search,
        view,
        pagination,
        sorting,
        columnVisibility,
        filters,
        group,
        dense,
    } = state;
    usePermissionRevision();
    const viewport = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
        start: [],
        end: [],
    });
    // Rebind when loading, grouping or errors replace the scroll owner;
    // its client width excludes the reserved scrollbar gutter.
    useLayoutEffect(() => {
        const node = viewport.current;
        if (!node) return;
        let frame = 0;
        const measure = () =>
            setWidth((previous) => {
                const scroll = node.querySelector<HTMLElement>(
                    '[data-slot="scroll-area-viewport"], [data-slot="data-grid-table-viewport"]',
                );
                const next = Math.max(
                    0,
                    Math.floor(scroll?.clientWidth ?? node.clientWidth),
                );
                return next === previous ? previous : next;
            });
        measure();
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        });
        observer.observe(node);
        const tableViewport = node.querySelector<HTMLElement>(
            '[data-slot="scroll-area-viewport"], [data-slot="data-grid-table-viewport"]',
        );
        if (tableViewport) observer.observe(tableViewport);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [
        resource.name,
        result.isPending,
        result.isError,
        effectiveGroup,
        groupResult.isPending,
    ]);
    const compactControls = width > 0 && width < 560;
    const [preferredSizes, setPreferredSizes] = useState<
        Record<string, number>
    >({});
    const reservedWidth =
        (rowSelection ? 40 : 0) + (actions !== false ? 40 : 0);
    const stackedRows = stackRecordColumns(
        resource,
        width,
        columnVisibility,
        reservedWidth,
    );
    const sizing = useMemo(
        () =>
            resolveColumnLayout(
                resource,
                width,
                columnVisibility,
                reservedWidth,
                preferredSizes,
            ),
        [resource, width, columnVisibility, reservedWidth, preferredSizes],
    );
    const hasQuery =
        !!(searchable && search.trim()) ||
        Object.keys(filters).some(
            (field) => filterable || directFields.includes(field),
        );
    const setSorting = controller.setSorters;
    const setColumnVisibility = (
        value: import("@tanstack/react-table").Updater<ColumnVisibilityState>,
    ) => update("columnVisibility", value);
    const [selection, setSelection] = useState<RowSelectionState>({});
    const [selectingAll, setSelectingAll] = useState(false);
    const [selectionError, setSelectionError] = useState<string>();
    const pendingRowOpen = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (pendingRowOpen.current) clearTimeout(pendingRowOpen.current);
        },
        [],
    );
    const directDefinitions = filterDefinitions.filter(
        (definition) =>
            directFields.includes(definition.field) &&
            supportsDirectFilter(definition),
    );
    const builderDefinitions = filterDefinitions.filter(
        (definition) =>
            !directDefinitions.some(
                (direct) => direct.field === definition.field,
            ),
    );
    const rollups = useCollectionSummary(
        resource,
        { query: scopedQuery, filters: apiFilters },
        summary,
    );
    const rows = result.data?.data ?? EMPTY_ROWS;
    useEffect(() => {
        if (paging && !result.isFetching && result.data && query === search) {
            const lastIndex = Math.max(
                0,
                Math.ceil(result.data.total / pagination.pageSize) - 1,
            );
            if (pagination.pageIndex > lastIndex)
                update("pagination", (p) => ({ ...p, pageIndex: lastIndex }));
        }
    }, [
        result.data,
        result.isFetching,
        pagination.pageIndex,
        pagination.pageSize,
        query,
        search,
        paging,
    ]);
    const previousPage = useRef(pagination.pageIndex);
    useEffect(() => {
        if (!controller.globalSelection.length) setSelection({});
        setSelectionError(undefined);
        if (
            !compact &&
            previousPage.current !== pagination.pageIndex &&
            window.innerWidth < 768
        ) {
            const workspace = viewport.current?.closest<HTMLElement>(
                '[data-slot="workspace-scroll"]',
            );
            const records = viewport.current?.querySelector<HTMLElement>(
                '[data-slot="scroll-area-viewport"]',
            );
            if (workspace && records) {
                workspace.scrollTo({
                    top:
                        workspace.scrollTop +
                        records.getBoundingClientRect().top -
                        workspace.getBoundingClientRect().top -
                        8,
                });
            }
        }
        previousPage.current = pagination.pageIndex;
        viewport.current
            ?.querySelectorAll<HTMLElement>(
                '[data-slot="scroll-area-viewport"], [data-slot="data-grid-table-viewport"]',
            )
            .forEach((node) => {
                node.scrollTop = 0;
            });
    }, [
        JSON.stringify(sorting),
        query,
        pagination.pageIndex,
        pagination.pageSize,
        group,
        JSON.stringify(filters),
        JSON.stringify(fixedFilters),
        activeView?.id,
    ]);
    const tableRef = useRef<unknown>(null);
    const instance: Partial<ResourceInstance> = {
        reload,
        form,
        formResource,
        get table() {
            return tableRef.current;
        },
        refreshForm: async () => {
            await onSaved?.();
        },
    };
    const instanceRef = useRef(instance);
    const boundContext = (options?: RelationFormOptions) =>
        options?.binding === "none"
            ? undefined
            : context
              ? {
                    ...context,
                    mode:
                        options?.binding === "prefill"
                            ? ("prefill" as const)
                            : ("locked" as const),
                }
              : undefined;
    const openEdit = (row: RecordData) =>
        workbench.openForm({
            resource,
            mode: "edit",
            row,
            ...editForm,
            context: boundContext(editForm),
            onSaved,
        });
    instance.openForm = (request) =>
        workbench.openForm({
            ...request,
            ...editForm,
            context: boundContext(editForm),
            onSaved,
        });
    instanceRef.current = instance;
    const liveInstance = useMemo<Partial<ResourceInstance>>(
        () => ({
            reload: () => instanceRef.current.reload!(),
            openForm: (request) => instanceRef.current.openForm!(request),
            refreshForm: () => instanceRef.current.refreshForm!(),
            get form() {
                return instanceRef.current.form;
            },
            get formResource() {
                return instanceRef.current.formResource;
            },
            get table() {
                return instanceRef.current.table;
            },
        }),
        [],
    );
    const create = () => {
        const flow = createForm?.flow ?? resource.createFlow;
        if (flow) {
            workbench.openFlow(flow, {
                parent: context
                    ? { resource: context.resource, id: context.id }
                    : undefined,
                presentation: createForm?.presentation,
            });
            return;
        }
        workbench.openForm({
            resource,
            mode: "create",
            defaults,
            context: boundContext(createForm),
            onSaved,
            wizard: !compact && !!resource.groups,
            ...createForm,
        });
    };
    const singleDataColumn =
        resource.columns.filter(
            (column) => columnVisibility[column.field] !== false,
        ).length === 1;
    const columns = useMemo<ColumnDef<DataGridFeatures, RecordData>[]>(
        () => [
            ...(rowSelection
                ? [
                      {
                          id: "selection",
                          header: () =>
                              rowSelection === "single" || !selectAll ? null : (
                                  <DataGridTableRowSelectAll />
                              ),
                          cell: ({ row }) => (
                              <DataGridTableRowSelect row={row} />
                          ),
                          size: 40,
                          minSize: 40,
                          maxSize: 40,
                          meta: {
                              skeleton: (
                                  <GridCellSkeleton
                                      dense={dense}
                                      kind="selection"
                                  />
                              ),
                          },
                          enableResizing: false,
                          enablePinning: false,
                          enableSorting: false,
                          enableHiding: false,
                      } as ColumnDef<DataGridFeatures, RecordData>,
                  ]
                : []),
            ...resource.columns.map((c) => ({
                id: c.field,
                accessorFn: (row: RecordData) => recordValue(row, c.field),
                ...sizing[c.field],
                meta: {
                    headerTitle: c.label,
                    fillWidth: singleDataColumn,
                    skeleton: <GridCellSkeleton dense={dense} kind={c.kind} />,
                    cellClassName: ["currency", "number"].includes(c.kind ?? "")
                        ? "text-right tabular-nums"
                        : undefined,
                },
                header: ({
                    column,
                }: {
                    column: import("@tanstack/react-table").Column<
                        DataGridFeatures,
                        RecordData,
                        unknown
                    >;
                }) => (
                    <DataGridColumnHeader
                        column={column}
                        title={c.label}
                        visibility={columnChooser}
                    />
                ),
                enablePinning: pinnable,
                enableSorting: c.sortable !== false,
                enableHiding: c.hideable !== false,
                cell: ({
                    row,
                }: {
                    row: import("@tanstack/react-table").Row<
                        DataGridFeatures,
                        RecordData
                    >;
                }) => (
                    <div
                        className={cn(
                            "min-w-0",
                            c.field === resource.titleField &&
                                "font-medium text-foreground",
                        )}
                    >
                        {formatCell(c, row.original)}
                    </div>
                ),
            })),
            ...filterDefinitions
                .filter(
                    (f) => !resource.columns.some((c) => c.field === f.field),
                )
                .map((f) => ({
                    id: f.field,
                    accessorFn: (row: RecordData) => row[f.field],
                    enableHiding: false,
                    enableSorting: false,
                })),
            ...(actions !== false
                ? [
                      {
                          id: "actions",
                          header: "",
                          cell: ({ row }) => (
                              <RowActions
                                  resource={resource}
                                  row={row.original}
                                  instance={liveInstance}
                                  allowed={actions}
                              />
                          ),
                          size: 40,
                          minSize: 40,
                          maxSize: 40,
                          meta: {
                              cellClassName: "text-right",
                              skeleton: (
                                  <GridCellSkeleton
                                      dense={dense}
                                      kind="actions"
                                  />
                              ),
                          },
                          enableResizing: false,
                          enablePinning: false,
                          enableSorting: false,
                          enableHiding: false,
                      } as ColumnDef<DataGridFeatures, RecordData>,
                  ]
                : []),
        ],
        [
            resource,
            rowSelection,
            selectAll,
            actions,
            columnChooser,
            sizing,
            dense,
            filterDefinitions,
            pinnable,
            singleDataColumn,
        ],
    );
    const columnSizes = {
        ...Object.fromEntries(
            Object.entries(sizing).map(([field, layout]) => [
                field,
                layout.size,
            ]),
        ),
        selection: 40,
        actions: 40,
    };
    const table = useTable({
        initialState: {
            columnVisibility: defaultColumnVisibility(resource),
        },
        features: dataGridFeatures,
        columns,
        data: rows,
        getRowId: (row) => String(row.id),
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        rowCount: result.data?.total ?? 0,
        state: {
            columnSizing: columnSizes,
            columnPinning: {
                start: pinnable ? columnPinning.start : [],
                end: [
                    ...(pinnable
                        ? (columnPinning.end ?? []).filter(
                              (id) => id !== "actions",
                          )
                        : []),
                    ...(actions !== false ? ["actions"] : []),
                ],
            },
            pagination: paging ? pagination : { pageIndex: 0, pageSize: 100 },
            sorting,
            rowSelection: selection,
            columnVisibility: {
                ...Object.fromEntries(
                    filterDefinitions
                        .filter(
                            (f) =>
                                !resource.columns.some(
                                    (c) => c.field === f.field,
                                ),
                        )
                        .map((f) => [f.field, false]),
                ),
                ...columnVisibility,
            },
            columnFilters: Object.entries(filterable ? filters : {}).map(
                ([id, rule]) => ({ id, value: rule.values }),
            ),
        },
        onColumnPinningChange: setColumnPinning,
        onColumnSizingChange: (next) =>
            setPreferredSizes(
                typeof next === "function" ? next(columnSizes) : next,
            ),
        onColumnFiltersChange: (value) =>
            update(
                "filters",
                (previous) => {
                    const prior = Object.entries(previous).map(
                        ([id, rule]) => ({ id, value: rule.values }),
                    );
                    const next =
                        typeof value === "function" ? value(prior) : value;
                    return Object.fromEntries(
                        next
                            .filter(
                                (f) => Array.isArray(f.value) && f.value.length,
                            )
                            .map((f) => [
                                f.id,
                                {
                                    operator: previous[f.id]?.operator ?? "in",
                                    values: f.value as string[],
                                },
                            ]),
                    );
                },
                true,
            ),
        onColumnVisibilityChange: setColumnVisibility,
        onPaginationChange: (value) => update("pagination", value),
        onSortingChange: setSorting,
        onRowSelectionChange: setSelection,
        enableRowSelection:
            rowSelection === false || result.isPlaceholderData
                ? false
                : typeof rowSelection === "function"
                  ? (row) => rowSelection(row.original)
                  : true,
        enableMultiRowSelection: rowSelection !== "single",
    });
    tableRef.current = table;
    const selectedRows = controller.globalSelection.length
        ? controller.globalSelection
        : rows.filter(
              (r) =>
                  selection[String(r.id)] &&
                  (typeof rowSelection !== "function" || rowSelection(r)),
          );
    const tableActions = resource.actions.filter(
        (action) =>
            actions !== false && (!actions || actions.includes(action.id)),
    );
    const grouped =
        effectiveGroup === "none" || !groupResult.data
            ? null
            : Object.fromEntries(
                  groupResult.data.groups.flatMap(
                      (
                          entry,
                      ): [string, { total: number; items: RecordData[] }][] => {
                          const key = String(entry.value ?? "—");
                          const items = rows.filter(
                              (record) =>
                                  String(record[effectiveGroup] ?? "—") === key,
                          );
                          // Do not mount hundreds of empty grids for groups absent from this page.
                          return items.length
                              ? [[key, { total: entry.count, items }]]
                              : [];
                      },
                  ),
              );
    const emptyState = (
        <EmptyState
            title={hasQuery ? t("noMatches") : t("empty")}
            description={
                hasQuery
                    ? t("noMatchesDescription")
                    : "In diesem Bereich sind noch keine Datensätze vorhanden."
            }
            action={
                hasQuery ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={clearQuery}
                    >
                        {t("reset")}
                    </Button>
                ) : !toolbar && creatable && can(resource.name, "create") ? (
                    <Button type="button" onClick={create}>
                        <Plus />
                        {resource.singular} anlegen
                    </Button>
                ) : undefined
            }
        />
    );
    const openRecord = (row: RecordData) =>
        viewMode === "page"
            ? navigate(`/${resource.name}/${row.id}`)
            : workbench.openForm({
                  resource,
                  mode: "view",
                  row,
                  presentation: viewMode,
              });
    const openFromTable = (row: RecordData) => {
        const permission = access(resource.name, "view", row);
        if (
            !detailLink ||
            result.isPlaceholderData ||
            (!permission.allowed && !permission.pending)
        )
            return;
        if (
            doubleClickEdit &&
            actions !== false &&
            (!actions || actions.includes("edit")) &&
            can(resource.name, "edit", row)
        ) {
            if (pendingRowOpen.current) clearTimeout(pendingRowOpen.current);
            pendingRowOpen.current = setTimeout(() => {
                pendingRowOpen.current = null;
                openRecord(row);
            }, 220);
        } else {
            openRecord(row);
        }
    };
    const recordCards = (items: RecordData[]) => (
        <ResponsiveRecordList
            columns={resource.columns.filter(
                (column) => columnVisibility[column.field] !== false,
            )}
            rows={items}
            titleField={resource.titleField}
            loading={result.isPending}
            empty={emptyState}
            open={detailLink ? openRecord : undefined}
            selected={(row) => !!selection[String(row.id)]}
            selection={
                rowSelection
                    ? {
                          header:
                              rowSelection === "single" ||
                              !selectAll ? undefined : (
                                  <DataGridTableRowSelectAll />
                              ),
                          row: (row) => (
                              <DataGridTableRowSelect
                                  row={table.getRow(String(row.id))}
                              />
                          ),
                      }
                    : undefined
            }
            actions={
                actions !== false
                    ? (row) => (
                          <RowActions
                              resource={resource}
                              row={row}
                              instance={liveInstance}
                              allowed={actions}
                          />
                      )
                    : undefined
            }
        />
    );
    const renderToolbar = (
        filterTrigger?: ReactNode,
        activeFilters?: ReactNode,
    ) => (
        <div
            data-slot="collection-toolbar"
            className="flex min-w-0 flex-col gap-3"
        >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div data-slot="collection-controls" className="contents">
                    <DirectFilters
                        definitions={directDefinitions}
                        value={filters}
                        onChange={(next) => update("filters", next, true)}
                    />
                    {searchable && (
                        <div
                            className={cn(
                                "relative min-w-0",
                                compactControls
                                    ? "basis-full"
                                    : "min-w-40 max-w-64 flex-1 basis-40",
                            )}
                        >
                            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => {
                                    update("search", e.target.value, true);
                                }}
                                className="h-9 bg-card pl-9 pr-9"
                                aria-label={`${resource.label} durchsuchen`}
                                placeholder={`${resource.label} durchsuchen …`}
                            />
                            {search && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="absolute right-1.5 top-1.5"
                                    aria-label="Suche leeren"
                                    onClick={() => update("search", "", true)}
                                >
                                    <X />
                                </Button>
                            )}
                        </div>
                    )}
                    {filterTrigger}
                    {groupable && resource.groupBy && (
                        <ChoicePicker
                            presentation="menu"
                            triggerIcon={<ListFilter />}
                            iconOnly={compactControls}
                            aria-label="Gruppierung"
                            placeholder={t("group")}
                            clearable={false}
                            value={group === "none" ? null : group}
                            onChange={(value) =>
                                update("group", String(value ?? "none"), true)
                            }
                            options={[
                                {
                                    value: "none",
                                    label: "Keine Gruppierung",
                                },
                                ...resource.groupBy,
                            ]}
                        />
                    )}
                </div>
                <div
                    data-slot="collection-actions"
                    className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2"
                >
                    <ActionButtons
                        actions={tableActions}
                        target={{ resource, rows: [], instance }}
                        placement="table"
                    />
                    {!compactControls && exportable && (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            aria-label={
                                selectedRows.length
                                    ? "Auswahl als CSV exportieren"
                                    : "Aktuelle Seite als CSV exportieren"
                            }
                            disabled={!rows.length || result.isPlaceholderData}
                            onClick={() =>
                                exportRows(
                                    selectedRows.length ? selectedRows : rows,
                                    resource.columns.filter(
                                        (c) =>
                                            columnVisibility[c.field] !== false,
                                    ),
                                    resource.label,
                                )
                            }
                        >
                            <Download />
                        </Button>
                    )}
                    {!compactControls && refreshable && (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            onClick={() => {
                                void result.refetch();
                                if (summary && resource.summary)
                                    void rollups.refetch();
                            }}
                            aria-label="Aktualisieren"
                        >
                            <RefreshCw
                                className={
                                    result.isFetching ? "animate-spin" : ""
                                }
                            />
                        </Button>
                    )}
                    {compactControls && (exportable || refreshable) && (
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button
                                        variant="outline"
                                        size="icon-lg"
                                        aria-label="Weitere Tabellenaktionen"
                                    />
                                }
                            >
                                <Ellipsis />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {refreshable && (
                                    <DropdownMenuItem
                                        onClick={() => {
                                            void result.refetch();
                                            if (summary && resource.summary)
                                                void rollups.refetch();
                                        }}
                                    >
                                        <RefreshCw />
                                        Aktualisieren
                                    </DropdownMenuItem>
                                )}
                                {exportable && (
                                    <DropdownMenuItem
                                        disabled={
                                            !rows.length ||
                                            result.isPlaceholderData
                                        }
                                        onClick={() =>
                                            exportRows(
                                                selectedRows.length
                                                    ? selectedRows
                                                    : rows,
                                                resource.columns.filter(
                                                    (c) =>
                                                        columnVisibility[
                                                            c.field
                                                        ] !== false,
                                                ),
                                                resource.label,
                                            )
                                        }
                                    >
                                        <Download />
                                        {selectedRows.length
                                            ? "Auswahl als CSV exportieren"
                                            : "Aktuelle Seite als CSV exportieren"}
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    {creatable && can(resource.name, "create") && (
                        <Button
                            onClick={create}
                            size="lg"
                            aria-label={
                                compact
                                    ? "Hinzufügen"
                                    : `${resource.singular} anlegen`
                            }
                        >
                            <Plus />
                            {compactControls
                                ? "Neu"
                                : compact
                                  ? "Hinzufügen"
                                  : `${resource.singular} anlegen`}
                        </Button>
                    )}
                </div>
            </div>
            {activeFilters}
        </div>
    );
    return (
        <DataGrid
            table={table}
            onRowClick={
                detailLink && !result.isPlaceholderData
                    ? openFromTable
                    : undefined
            }
            recordCount={result.data?.total ?? 0}
            isLoading={result.isPending}
            loadingMode="skeleton"
            emptyMessage={emptyState}
            i18n={i18n}
            tableLayout={{
                columnsVisibility: columnChooser,
                columnsResizable: resizable,
                columnsPinnable: pinnable || actions !== false,
                columnsMovable: true,
                headerSticky: true,
                headerBackground: true,
                dense,
            }}
        >
            <div
                className={cn(
                    "relative min-h-0 min-w-0",
                    !compact && "md:h-full md:flex-1",
                )}
            >
                <div
                    ref={viewport}
                    data-slot="resource-collection"
                    aria-busy={result.isFetching}
                    className={cn(
                        "flex min-h-0 min-w-0 flex-col gap-4",
                        !compact &&
                            "md:h-full md:overflow-x-hidden md:overflow-y-auto md:overscroll-contain",
                    )}
                    onDoubleClick={(event) => {
                        if (
                            !doubleClickEdit ||
                            actions === false ||
                            (actions && !actions.includes("edit")) ||
                            result.isPlaceholderData ||
                            !isRowActivationEvent(event, true)
                        )
                            return;
                        const id = (event.target as HTMLElement)
                            .closest("[data-row-id]")
                            ?.getAttribute("data-row-id");
                        const row = rows.find((r) => String(r.id) === id);
                        if (
                            row &&
                            (access(resource.name, "edit", row).pending ||
                                can(resource.name, "edit", row))
                        ) {
                            if (pendingRowOpen.current) {
                                clearTimeout(pendingRowOpen.current);
                                pendingRowOpen.current = null;
                            }
                            openEdit(row);
                        }
                    }}
                >
                    {result.isPending && (
                        <span
                            role="status"
                            aria-label="Tabelle wird geladen"
                            className="sr-only"
                        >
                            {resource.label} werden geladen.
                        </span>
                    )}
                    <CollectionSurface
                        compact={compact}
                        summary={
                            summary && resource.summary ? (
                                <CollectionKpis
                                    definition={resource.summary}
                                    values={rollups.data?.data}
                                    loading={rollups.isPending}
                                    refreshing={rollups.isFetching}
                                    error={rollups.error}
                                    retry={() => rollups.refetch()}
                                />
                            ) : undefined
                        }
                        navigation={
                            views.length > 0 ? (
                                <CollectionViews
                                    icons={tabIcons}
                                    panelId={panelId}
                                    resource={resource}
                                    views={views}
                                    active={activeView!.id}
                                    fixedFilters={fixedFilters}
                                    onChange={(next) =>
                                        update("view", next, true)
                                    }
                                />
                            ) : undefined
                        }
                    >
                        <div
                            id={panelId}
                            role={views.length ? "tabpanel" : undefined}
                            aria-labelledby={
                                views.length
                                    ? collectionViewTabId(
                                          panelId,
                                          activeView!.id,
                                      )
                                    : undefined
                            }
                            className="relative flex min-w-0 flex-col md:min-h-0 md:flex-1"
                        >
                            {toolbar && (
                                <div
                                    className={cn(
                                        "shrink-0 space-y-3",
                                        !compact ? "p-3 sm:p-4" : "pb-3",
                                    )}
                                >
                                    {filterable &&
                                    !!builderDefinitions.length ? (
                                        <ResourceFilters
                                            definitions={builderDefinitions}
                                            value={filters}
                                            onChange={(next) =>
                                                update("filters", next, true)
                                            }
                                            renderToolbar={renderToolbar}
                                        />
                                    ) : (
                                        renderToolbar()
                                    )}
                                </div>
                            )}
                            {result.isFetching && !result.isPending && (
                                <div
                                    data-slot="collection-table-progress"
                                    role="status"
                                    aria-label="Tabellendaten werden aktualisiert"
                                    className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-muted"
                                >
                                    <div className="h-full w-full animate-pulse bg-primary/40" />
                                </div>
                            )}
                            {result.error ? (
                                <ErrorState
                                    error={result.error}
                                    retry={() => result.refetch()}
                                />
                            ) : (
                                <>
                                    <div
                                        inert={result.isPlaceholderData}
                                        className={cn(
                                            "min-h-0",
                                            result.isPlaceholderData &&
                                                "pointer-events-none opacity-60",
                                            compact
                                                ? "max-h-[32rem] overflow-hidden"
                                                : stackedRows
                                                  ? "min-h-64 md:flex-1 md:overflow-hidden"
                                                  : "min-h-24 md:flex-1 md:overflow-hidden",
                                        )}
                                    >
                                        {effectiveGroup !== "none" &&
                                            groupResult.isError && (
                                                <div
                                                    role="alert"
                                                    className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 px-4 py-2 text-sm"
                                                >
                                                    <span>
                                                        Serverweite Gruppierung
                                                        nicht verfügbar. Die
                                                        Tabelle zeigt die
                                                        normale Seitenansicht.
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() =>
                                                            void groupResult.refetch()
                                                        }
                                                    >
                                                        Erneut versuchen
                                                    </Button>
                                                </div>
                                            )}
                                        {effectiveGroup !== "none" &&
                                        groupResult.isPending ? (
                                            <div
                                                role="status"
                                                className="p-5 text-sm text-muted-foreground"
                                            >
                                                Gruppen werden serverseitig
                                                berechnet …
                                            </div>
                                        ) : grouped && rows.length > 0 ? (
                                            <TableViewport
                                                compact={compact}
                                                pageFlow={!compact}
                                            >
                                                <div className="space-y-4">
                                                    {Object.entries(
                                                        grouped,
                                                    ).map(([key, items]) => (
                                                        <section
                                                            key={key}
                                                            className="overflow-hidden rounded-xl border"
                                                        >
                                                            <div className="flex items-center justify-between bg-muted/50 px-4 py-2 text-xs font-semibold">
                                                                <span>
                                                                    {filterDefinitions
                                                                        .find(
                                                                            (
                                                                                filter,
                                                                            ) =>
                                                                                filter.field ===
                                                                                effectiveGroup,
                                                                        )
                                                                        ?.options?.find(
                                                                            (
                                                                                option,
                                                                            ) =>
                                                                                String(
                                                                                    option.value,
                                                                                ) ===
                                                                                key,
                                                                        )
                                                                        ?.label ??
                                                                        label(
                                                                            key,
                                                                        )}
                                                                </span>
                                                                <span className="font-normal text-muted-foreground">
                                                                    {
                                                                        items!
                                                                            .items
                                                                            .length
                                                                    }{" "}
                                                                    auf dieser
                                                                    Seite ·{" "}
                                                                    {
                                                                        items!
                                                                            .total
                                                                    }{" "}
                                                                    insgesamt
                                                                </span>
                                                            </div>
                                                            {stackedRows ? (
                                                                recordCards(
                                                                    items!
                                                                        .items,
                                                                )
                                                            ) : (
                                                                <GroupedGrid
                                                                    columns={
                                                                        columns
                                                                    }
                                                                    rows={
                                                                        items!
                                                                            .items
                                                                    }
                                                                    selection={
                                                                        selection
                                                                    }
                                                                    onSelection={
                                                                        setSelection
                                                                    }
                                                                    sorting={
                                                                        sorting
                                                                    }
                                                                    onSorting={
                                                                        setSorting
                                                                    }
                                                                    columnVisibility={
                                                                        columnVisibility
                                                                    }
                                                                    onVisibility={
                                                                        setColumnVisibility
                                                                    }
                                                                    selectionMode={
                                                                        rowSelection
                                                                    }
                                                                    dense={
                                                                        dense
                                                                    }
                                                                    defaultVisibility={defaultColumnVisibility(
                                                                        resource,
                                                                    )}
                                                                    onRowClick={
                                                                        detailLink &&
                                                                        !result.isPlaceholderData
                                                                            ? openFromTable
                                                                            : undefined
                                                                    }
                                                                />
                                                            )}
                                                        </section>
                                                    ))}
                                                </div>
                                            </TableViewport>
                                        ) : (
                                            <DataGridContainer
                                                className={cn(
                                                    !compact && "md:h-full",
                                                )}
                                            >
                                                {!stackedRows &&
                                                rows.length > 0 &&
                                                (virtualized === true ||
                                                    (virtualized === "auto" &&
                                                        rows.length >= 50)) &&
                                                !result.isPending ? (
                                                    <DataGridTableVirtual
                                                        height={
                                                            compact
                                                                ? 480
                                                                : "100%"
                                                        }
                                                        estimateSize={
                                                            dense ? 36 : 44
                                                        }
                                                        overscan={8}
                                                    />
                                                ) : (
                                                    <TableViewport
                                                        compact={compact}
                                                        pageFlow={!compact}
                                                    >
                                                        {stackedRows ? (
                                                            recordCards(rows)
                                                        ) : (
                                                            <DataGridTable />
                                                        )}
                                                    </TableViewport>
                                                )}
                                            </DataGridContainer>
                                        )}
                                    </div>
                                    <div
                                        className={cn(
                                            "shrink-0 border-t bg-card",
                                            compact
                                                ? "pt-3"
                                                : "sticky bottom-0 z-10 rounded-b-xl px-3 py-3 sm:px-4 md:static",
                                        )}
                                    >
                                        {paging ? (
                                            <DataGridPagination
                                                className="w-full"
                                                compact={compactControls}
                                                sizes={[10, 25, 50, 100]}
                                            />
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                {rows.length} von{" "}
                                                {result.data?.total ?? 0}{" "}
                                                Einträgen · maximal 100 ohne
                                                Seitennavigation
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </CollectionSurface>
                </div>
                {selectedRows.length > 0 && !result.isPlaceholderData && (
                    <BulkActionBar
                        count={selectedRows.length}
                        pageFlow={!compact}
                        onClear={() => {
                            setSelection({});
                            controller.clearGlobalSelection();
                            setSelectionError(undefined);
                        }}
                    >
                        {allowAllFiltered &&
                            rowSelection === "multiple" &&
                            paging &&
                            !controller.globalSelection.length &&
                            rows.length > 0 &&
                            rows.every((row) => !!selection[String(row.id)]) &&
                            (result.data?.total ?? 0) > rows.length && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={selectingAll}
                                    onClick={async () => {
                                        setSelectionError(undefined);
                                        setSelectingAll(true);
                                        try {
                                            const all =
                                                await controller.selectAllFiltered();
                                            setSelection(
                                                Object.fromEntries(
                                                    all.map((record) => [
                                                        String(record.id),
                                                        true,
                                                    ]),
                                                ),
                                            );
                                        } catch (error) {
                                            setSelectionError(
                                                error instanceof Error
                                                    ? error.message
                                                    : "Auswahl fehlgeschlagen.",
                                            );
                                        } finally {
                                            setSelectingAll(false);
                                        }
                                    }}
                                >
                                    {selectingAll
                                        ? "Wird ausgewählt …"
                                        : `Alle ${result.data?.total ?? 0} Treffer auswählen`}
                                </Button>
                            )}
                        {selectionError && (
                            <span role="alert" className="max-w-xs text-xs">
                                {selectionError}
                            </span>
                        )}
                        <ActionButtons
                            actions={tableActions.filter((action) =>
                                resource.bulkActions === false
                                    ? false
                                    : !resource.bulkActions ||
                                      resource.bulkActions.includes(action.id),
                            )}
                            target={{
                                resource,
                                rows: selectedRows,
                                instance,
                            }}
                            placement="bulk"
                            inverse
                        />
                    </BulkActionBar>
                )}
            </div>
        </DataGrid>
    );
}
export function formatCell(
    column: import("../types").ColumnDefinition,
    row: RecordData,
) {
    return <CellRenderer column={column} row={row} />;
}
function GroupedGrid({
    columns,
    rows,
    selection,
    onSelection,
    sorting,
    onSorting,
    columnVisibility,
    onVisibility,
    selectionMode,
    dense,
    defaultVisibility,
    onRowClick,
}: {
    columns: ColumnDef<DataGridFeatures, RecordData>[];
    rows: RecordData[];
    selection: RowSelectionState;
    onSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>;
    sorting: SortingState;
    onSorting: React.Dispatch<React.SetStateAction<SortingState>>;
    columnVisibility: ColumnVisibilityState;
    onVisibility: React.Dispatch<React.SetStateAction<ColumnVisibilityState>>;
    selectionMode:
        false | "single" | "multiple" | ((row: RecordData) => boolean);
    dense: boolean;
    defaultVisibility: ColumnVisibilityState;
    onRowClick?: (row: RecordData) => void;
}) {
    const i18n = useGridI18n();
    const table = useTable({
        initialState: { columnVisibility: defaultVisibility },
        features: dataGridFeatures,
        columns,
        data: rows,
        getRowId: (r) => String(r.id),
        manualPagination: true,
        manualSorting: true,
        state: {
            rowSelection: selection,
            sorting,
            columnVisibility,
            columnPinning: {
                start: [],
                end: columns.some((column) => column.id === "actions")
                    ? ["actions"]
                    : [],
            },
        },
        onSortingChange: onSorting,
        onColumnVisibilityChange: onVisibility,
        onRowSelectionChange: onSelection,
        enableRowSelection:
            selectionMode === false
                ? false
                : typeof selectionMode === "function"
                  ? (row) => selectionMode(row.original)
                  : true,
        enableMultiRowSelection: selectionMode !== "single",
    });
    return (
        <DataGrid
            table={table}
            onRowClick={onRowClick}
            recordCount={rows.length}
            i18n={i18n}
            tableLayout={{
                dense,
                columnsVisibility: true,
                columnsPinnable: true,
                columnsResizable: true,
                width: "fixed",
                headerSticky: true,
            }}
        >
            <DataGridTable />
        </DataGrid>
    );
}
