import { BulkActionBar } from "@/components/blocks/bulk-action-bar";
import { ActionMenu, ActionButtons } from "../action-controls";
import type { ActionPlacement } from "../actions";
import { PresentationToggle } from "../presentation-toggle";
import { useGridState } from "./grid-state";
import { exportRows } from "./export";
import { cn } from "@/lib/utils";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { Download, X } from "lucide-react";
import { ErrorState, StatusBadge } from "@/components/blocks/content";
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { ChoicePicker } from "@/components/fields/choice-picker";
import { ResourceFilters } from "./resource-filters";
import { compileGridFilters } from "./filter-rules";
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
import { date, label, money, number } from "@/lib/format";
import {
    useTable,
    type ColumnDef,
    type RowSelectionState,
    type SortingState,
    type ColumnVisibilityState,
} from "@tanstack/react-table";
import { ListFilter, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useNavigate } from "react-router";
import { useDebounced, useReload, useResourceList } from "../data/hooks";
import { can } from "../permissions";
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
const i18n = {
    labels: {
        filterSelectedCount: (count: number) => `${count} ausgewählt`,
        filterNoResults: "Keine passenden Optionen",
        filterClear: "Filter zurücksetzen",
        selectAll: "Alle Zeilen dieser Seite auswählen",
        selectRow: "Zeile auswählen",
        empty: "Keine Einträge gefunden",
        loading: "Wird geladen …",
        rowsPerPage: "Zeilen pro Seite",
        previousPage: "Vorherige Seite",
        nextPage: "Nächste Seite",
        paginationInfo: ({
            from,
            to,
            count,
        }: {
            from: number;
            to: number;
            count: number;
        }) => `${from}–${to} von ${count}`,
        goToPage: (page: number) => `Seite ${page}`,
        toggleColumns: "Spalten",
        columnsMenu: "Spalten",
        sortAscending: "Aufsteigend",
        sortDescending: "Absteigend",
    },
};
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
    pagination: paging = true,
    rowSelection = "multiple",
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
    presentationToggle = false,
    toolbar = true,
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
    const navigate = useNavigate();
    const workbench = useWorkbench();
    const reload = useReload();
    const prefix =
        urlKey ??
        (compact
            ? `${resource.name}.${fixedFilters.map((f) => ("field" in f ? `${f.field}-${f.value}` : "relation")).join(".")}.`
            : "");
    const { state, update } = useGridState(resource, {
        sync: syncWithLocation,
        prefix,
        pageSize: compact ? 10 : 25,
    });
    const {
        search,
        pagination,
        sorting,
        columnVisibility,
        filters,
        group,
        dense,
    } = state;
    const query = useDebounced(searchable ? search : "");
    const effectiveGroup = groupable ? group : "none";
    const setSorting = (
        value: import("@tanstack/react-table").Updater<SortingState>,
    ) => update("sorting", value, true);
    const setColumnVisibility = (
        value: import("@tanstack/react-table").Updater<ColumnVisibilityState>,
    ) => update("columnVisibility", value);
    const [selection, setSelection] = useState<RowSelectionState>({});
    const apiFilters = [
        ...fixedFilters,
        ...compileGridFilters(filterable ? filters : {}),
    ];
    const sort = [
        ...(effectiveGroup !== "none"
            ? [{ field: effectiveGroup, direction: "asc" as const }]
            : []),
        ...sorting.map((s) => ({
            field: s.id,
            direction: s.desc ? ("desc" as const) : ("asc" as const),
        })),
    ];
    const result = useResourceList(
        resource,
        {
            query,
            page: paging ? pagination.pageIndex + 1 : 1,
            limit: paging ? pagination.pageSize : 100,
            filters: apiFilters,
            sort: sort.length ? sort : undefined,
        },
        true,
        true,
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
    useEffect(() => {
        setSelection({});
    }, [
        JSON.stringify(sorting),
        query,
        pagination.pageIndex,
        pagination.pageSize,
        group,
        JSON.stringify(filters),
        JSON.stringify(fixedFilters),
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
    const columns = useMemo<ColumnDef<DataGridFeatures, RecordData>[]>(
        () => [
            ...(rowSelection
                ? [
                      {
                          id: "selection",
                          header: () =>
                              rowSelection === "single" ? null : (
                                  <DataGridTableRowSelectAll />
                              ),
                          cell: ({ row }) => (
                              <DataGridTableRowSelect row={row} />
                          ),
                          size: 44,
                          enableResizing: false,
                          enablePinning: false,
                          enableSorting: false,
                          enableHiding: false,
                      } as ColumnDef<DataGridFeatures, RecordData>,
                  ]
                : []),
            ...resource.columns.map((c) => ({
                id: c.field,
                accessorFn: (row: RecordData) => row[c.field],
                meta: { headerTitle: c.label },
                size: c.kind === "badge" ? 190 : 160,
                minSize: 100,
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
                enableSorting: c.sortable !== false,
                cell: ({
                    row,
                }: {
                    row: import("@tanstack/react-table").Row<
                        DataGridFeatures,
                        RecordData
                    >;
                }) =>
                    c.field === resource.titleField && detailLink ? (
                        <button
                            className="font-medium text-foreground hover:text-primary"
                            onClick={() =>
                                navigate(`/${resource.name}/${row.original.id}`)
                            }
                        >
                            {formatCell(c, row.original)}
                        </button>
                    ) : (
                        formatCell(c, row.original)
                    ),
            })),
            ...(resource.filters ?? [])
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
                          size: 64,
                          minSize: 64,
                          maxSize: 64,
                          meta: { cellClassName: "text-right" },
                          enableResizing: false,
                          enablePinning: false,
                          enableSorting: false,
                          enableHiding: false,
                      } as ColumnDef<DataGridFeatures, RecordData>,
                  ]
                : []),
        ],
        [resource, navigate, rowSelection, actions, detailLink, columnChooser],
    );
    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: rows,
        getRowId: (row) => String(row.id),
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        rowCount: result.data?.total ?? 0,
        state: {
            pagination: paging ? pagination : { pageIndex: 0, pageSize: 100 },
            sorting,
            rowSelection: selection,
            columnVisibility: {
                ...Object.fromEntries(
                    (resource.filters ?? [])
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
    const selectedRows = rows.filter(
        (r) =>
            selection[String(r.id)] &&
            (typeof rowSelection !== "function" || rowSelection(r)),
    );
    const bulk = resource.actions.filter(
        (action) =>
            actions !== false && (!actions || actions.includes(action.id)),
    );
    const grouped =
        effectiveGroup === "none"
            ? null
            : rows.reduce<Record<string, RecordData[]>>((groups, row) => {
                  const key = String(row[effectiveGroup] ?? "—");
                  (groups[key] ??= []).push(row);
                  return groups;
              }, {});
    const renderToolbar = (filterTrigger?: ReactNode) => (
        <div className="flex flex-wrap items-center gap-2.5">
            {searchable && (
                <div className="relative min-w-48 flex-1 sm:max-w-72">
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
            <div className="flex flex-1 flex-wrap items-center gap-2">
                {presentationToggle && <PresentationToggle />}
                {groupable && resource.groupBy && (
                    <ChoicePicker
                        presentation="menu"
                        size="sm"
                        triggerIcon={<ListFilter />}
                        aria-label="Gruppierung"
                        placeholder="Gruppieren"
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
                <div className="ml-auto flex items-center gap-2">
                    <ActionButtons
                        actions={bulk}
                        target={{ resource, rows: [], instance }}
                        placement="table"
                    />
                    {exportable && (
                        <Button
                            variant="outline"
                            size="icon"
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
                                    resource.name,
                                )
                            }
                        >
                            <Download />
                        </Button>
                    )}
                    {refreshable && (
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => result.refetch()}
                            aria-label="Aktualisieren"
                        >
                            <RefreshCw
                                className={
                                    result.isFetching ? "animate-spin" : ""
                                }
                            />
                        </Button>
                    )}
                    {creatable && can(resource.name, "create") && (
                        <Button
                            onClick={create}
                            size={compact ? "sm" : "default"}
                        >
                            <Plus />
                            {compact
                                ? "Hinzufügen"
                                : `${resource.singular} anlegen`}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
    return (
        <DataGrid
            table={table}
            recordCount={result.data?.total ?? 0}
            isLoading={result.isPending}
            loadingMode="skeleton"
            i18n={i18n}
            tableLayout={{
                columnsVisibility: columnChooser,
                columnsResizable: resizable,
                columnsPinnable: pinnable,
                columnsMovable: true,
                headerSticky: true,
                headerBackground: true,
                dense,
            }}
        >
            <div
                data-slot="resource-collection"
                aria-busy={result.isFetching}
                className={cn(
                    "relative flex min-h-0 flex-col gap-3",
                    compact ? "" : "h-full",
                )}
                onDoubleClick={(event) => {
                    if (
                        !doubleClickEdit ||
                        actions === false ||
                        (actions && !actions.includes("edit")) ||
                        result.isPlaceholderData ||
                        (event.target as HTMLElement).closest(
                            "button,a,input,[role=checkbox],[role=menuitem]",
                        )
                    )
                        return;
                    const id = (event.target as HTMLElement)
                        .closest("tr[data-row-id]")
                        ?.getAttribute("data-row-id");
                    const row = rows.find((r) => String(r.id) === id);
                    if (row && can(resource.name, "edit", row)) openEdit(row);
                }}
            >
                {result.isFetching && !result.isPending && (
                    <div
                        role="status"
                        className="absolute inset-x-0 -top-2 h-0.5 overflow-hidden bg-muted"
                    >
                        <div className="h-full w-full animate-pulse bg-primary/40" />
                        <span className="sr-only">
                            Daten werden aktualisiert
                        </span>
                    </div>
                )}
                {toolbar && (
                    <div className="space-y-3">
                        {filterable && !!resource.filters?.length ? (
                            <ResourceFilters
                                definitions={resource.filters}
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
                {selectedRows.length > 0 && !result.isPlaceholderData && (
                    <BulkActionBar
                        count={selectedRows.length}
                        onClear={() => setSelection({})}
                    >
                        <ActionButtons
                            actions={bulk}
                            target={{ resource, rows: selectedRows, instance }}
                            placement="bulk"
                            inverse
                        />
                    </BulkActionBar>
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
                                selectedRows.length > 0 && "pb-16",
                                result.isPlaceholderData &&
                                    "pointer-events-none opacity-60",
                                compact
                                    ? "max-h-[32rem] overflow-auto"
                                    : "flex-1 overflow-hidden",
                            )}
                        >
                            {grouped ? (
                                <div className="h-full space-y-4 overflow-auto">
                                    {Object.entries(grouped).map(
                                        ([key, items]) => (
                                            <section
                                                key={key}
                                                className="overflow-hidden rounded-xl border"
                                            >
                                                <div className="flex items-center justify-between bg-muted/50 px-4 py-2 text-xs font-semibold">
                                                    <span>{label(key)}</span>
                                                    <span className="font-normal text-muted-foreground">
                                                        {items!.length} auf
                                                        dieser Seite
                                                    </span>
                                                </div>
                                                <GroupedGrid
                                                    columns={columns}
                                                    rows={items!}
                                                    selection={selection}
                                                    onSelection={setSelection}
                                                    sorting={sorting}
                                                    onSorting={setSorting}
                                                    columnVisibility={
                                                        columnVisibility
                                                    }
                                                    onVisibility={
                                                        setColumnVisibility
                                                    }
                                                    selectionMode={rowSelection}
                                                    dense={dense}
                                                />
                                            </section>
                                        ),
                                    )}
                                </div>
                            ) : (
                                <DataGridContainer
                                    className={compact ? "" : "h-full"}
                                >
                                    {(virtualized === true ||
                                        (virtualized === "auto" &&
                                            rows.length >= 50)) &&
                                    !result.isPending ? (
                                        <DataGridTableVirtual
                                            height={compact ? 480 : "100%"}
                                            estimateSize={dense ? 36 : 44}
                                            overscan={8}
                                        />
                                    ) : (
                                        <DataGridScrollArea
                                            className={
                                                compact
                                                    ? "max-h-[30rem]"
                                                    : "h-full"
                                            }
                                            orientation="both"
                                        >
                                            <DataGridTable />
                                        </DataGridScrollArea>
                                    )}
                                </DataGridContainer>
                            )}
                        </div>
                        <div className="shrink-0 border-t pt-3">
                            {paging ? (
                                <DataGridPagination
                                    className="w-full"
                                    sizes={[10, 25, 50, 100]}
                                />
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {rows.length} von {result.data?.total ?? 0}{" "}
                                    Einträgen · maximal 100 ohne
                                    Seitennavigation
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </DataGrid>
    );
}
export function formatCell(
    column: import("../types").ColumnDefinition,
    row: RecordData,
) {
    if (column.render) return column.render(row);
    const value = row[column.field];
    switch (column.kind) {
        case "currency":
            return money(value);
        case "date":
            return date(value);
        case "badge":
            return <StatusBadge value={value} />;
        case "number":
            return number(value, 2);
        default:
            return String(value ?? "—");
    }
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
}) {
    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: rows,
        getRowId: (r) => String(r.id),
        manualPagination: true,
        manualSorting: true,
        state: { rowSelection: selection, sorting, columnVisibility },
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
            recordCount={rows.length}
            i18n={i18n}
            tableLayout={{ dense, columnsVisibility: true }}
        >
            <DataGridTable />
        </DataGrid>
    );
}
