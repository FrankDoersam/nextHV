import { PresentationToggle } from "../presentation-toggle";
import { useGridState } from "./grid-state";
import { exportRows } from "./export";
import { cn } from "@/lib/utils";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { Download, Rows3, X } from "lucide-react";
import { ErrorState, StatusBadge } from "@/components/blocks/content";
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridColumnVisibility } from "@/components/reui/data-grid/data-grid-column-visibility";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import {
    DataGridTable,
    DataGridTableRowSelect,
    DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { date, label, money, number } from "@/lib/format";
import {
    useTable,
    type ColumnDef,
    type RowSelectionState,
    type SortingState,
    type ColumnVisibilityState,
} from "@tanstack/react-table";
import {
    Columns3,
    ListFilter,
    MoreHorizontal,
    Plus,
    RefreshCw,
    Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useNavigate } from "react-router";
import { useDebounced, useReload, useResourceList } from "../data/hooks";
import { can } from "../permissions";
import type {
    Filter,
    RecordData,
    ResourceDefinition,
    ResourceInstance,
    Values,
} from "../types";
import { useWorkbench } from "../workbench";
const i18n = {
    labels: {
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
}: {
    resource: ResourceDefinition;
    row: RecordData;
    instance?: Partial<ResourceInstance>;
    exclude?: string[];
}) {
    const workbench = useWorkbench();
    const actions = resource.actions.filter(
        (a) =>
            !exclude.includes(a.id) &&
            a.location !== "toolbar" &&
            a.visible(row) &&
            can(resource.name, a.id, row),
    );
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Aktionen für ${String(row[resource.titleField])}`}
                        onClick={(e) => e.stopPropagation()}
                    />
                }
            >
                <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {actions.map((action) => (
                    <DropdownMenuItem
                        key={action.id}
                        className={
                            action.destructive ? "text-destructive" : undefined
                        }
                        onClick={(e) => {
                            e.stopPropagation();
                            workbench.runAction(action, {
                                resource,
                                rows: [row],
                                instance,
                            });
                        }}
                    >
                        {action.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
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
    pagination: paging = true,
    rowSelection = "multiple",
    doubleClickEdit = true,
    syncWithLocation = true,
    urlKey,
    resizable = true,
    pinnable = true,
}: {
    resource: ResourceDefinition;
    fixedFilters?: Filter[];
    defaults?: Values;
    compact?: boolean;
    onSaved?: () => void | Promise<void>;
    form?: UseFormReturn<Values>;
    formResource?: ResourceDefinition;
    context?: import("../types").FormRequest["context"];
    searchable?: boolean;
    /** false hides controls and requests a bounded 100-row collection. */
    pagination?: boolean;
    rowSelection?:
        false | "single" | "multiple" | ((row: RecordData) => boolean);
    doubleClickEdit?: boolean;
    syncWithLocation?: boolean;
    urlKey?: string;
    resizable?: boolean;
    pinnable?: boolean;
}) {
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
    const query = useDebounced(search);
    const setSorting = (
        value: import("@tanstack/react-table").Updater<SortingState>,
    ) => update("sorting", value, true);
    const setColumnVisibility = (
        value: import("@tanstack/react-table").Updater<ColumnVisibilityState>,
    ) => update("columnVisibility", value);
    const [selection, setSelection] = useState<RowSelectionState>({});
    const apiFilters = [
        ...fixedFilters,
        ...Object.entries(filters)
            .filter(([, v]) => v !== "all")
            .map(([field, value]) => ({ field, value })),
    ];
    const sort = [
        ...(group !== "none"
            ? [{ field: group, direction: "asc" as const }]
            : []),
        ...sorting.map((s) => ({
            field: s.id,
            direction: s.desc ? ("desc" as const) : ("asc" as const),
        })),
    ];
    const result = useResourceList(resource, {
        query,
        page: paging ? pagination.pageIndex + 1 : 1,
        limit: paging ? pagination.pageSize : 100,
        filters: apiFilters,
        sort: sort.length ? sort : undefined,
    });
    const rows = result.data?.data ?? [];
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
    const create = () =>
        workbench.openForm({
            resource,
            mode: "create",
            defaults,
            context:
                context ??
                (() => {
                    const field = resource.fields.find(
                        (f) =>
                            f.kind === "relation" &&
                            typeof defaults?.[f.name] === "number",
                    );
                    return field
                        ? {
                              resource: field.resource!,
                              field: field.name,
                              id: Number(defaults![field.name]),
                          }
                        : undefined;
                })(),
            onSaved,
            wizard: !compact && !!resource.groups,
        });
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
                          size: 40,
                          enableSorting: false,
                          enableHiding: false,
                      } as ColumnDef<DataGridFeatures, RecordData>,
                  ]
                : []),
            ...resource.columns.map((c) => ({
                id: c.field,
                accessorFn: (row: RecordData) => row[c.field],
                meta: { headerTitle: c.label },
                header: ({
                    column,
                }: {
                    column: import("@tanstack/react-table").Column<
                        DataGridFeatures,
                        RecordData,
                        unknown
                    >;
                }) => <DataGridColumnHeader column={column} title={c.label} />,
                enableSorting: c.sortable !== false,
                cell: ({
                    row,
                }: {
                    row: import("@tanstack/react-table").Row<
                        DataGridFeatures,
                        RecordData
                    >;
                }) =>
                    c.field === resource.titleField ? (
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
            {
                id: "actions",
                header: "",
                cell: ({ row }) => (
                    <RowActions
                        resource={resource}
                        row={row.original}
                        instance={instance}
                    />
                ),
                size: 48,
                enableSorting: false,
                enableHiding: false,
            },
        ],
        [resource, navigate, form, onSaved, rowSelection],
    );
    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: rows,
        getRowId: (row) => String(row.id),
        manualPagination: true,
        manualSorting: true,
        rowCount: result.data?.total ?? 0,
        state: {
            pagination: paging ? pagination : { pageIndex: 0, pageSize: 100 },
            sorting,
            rowSelection: selection,
            columnVisibility,
        },
        onColumnVisibilityChange: setColumnVisibility,
        onPaginationChange: (value) => update("pagination", value),
        onSortingChange: setSorting,
        onRowSelectionChange: setSelection,
        enableRowSelection:
            rowSelection === false
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
        (a) =>
            (a.bulk || selectedRows.length === 1) &&
            a.location !== "row" &&
            selectedRows.every(
                (r) => a.visible(r) && can(resource.name, a.id, r),
            ),
    );
    const grouped =
        group === "none"
            ? null
            : rows.reduce<Record<string, RecordData[]>>((groups, row) => {
                  const key = String(row[group] ?? "—");
                  (groups[key] ??= []).push(row);
                  return groups;
              }, {});
    return (
        <DataGrid
            table={table}
            recordCount={result.data?.total ?? 0}
            isLoading={result.isPending}
            i18n={i18n}
            tableLayout={{
                columnsVisibility: true,
                columnsResizable: resizable,
                columnsPinnable: pinnable,
                columnsMovable: true,
                headerSticky: true,
                headerBackground: true,
                dense,
            }}
        >
            <div
                className={cn(
                    "flex min-h-0 flex-col gap-4",
                    compact ? "" : "h-full",
                )}
                onDoubleClick={(event) => {
                    if (
                        !doubleClickEdit ||
                        (event.target as HTMLElement).closest(
                            "button,a,input,[role=checkbox],[role=menuitem]",
                        )
                    )
                        return;
                    const id = (event.target as HTMLElement)
                        .closest("tr[data-row-id]")
                        ?.getAttribute("data-row-id");
                    const row = rows.find((r) => String(r.id) === id);
                    if (row && can(resource.name, "edit", row))
                        workbench.openForm({
                            resource,
                            mode: "edit",
                            row,
                            context,
                            onSaved,
                        });
                }}
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {searchable && (
                        <div className="relative min-w-48 flex-1 sm:max-w-80">
                            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => {
                                    update("search", e.target.value, true);
                                }}
                                className="h-9 bg-background pl-9 pr-9"
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
                    <div className="flex flex-wrap gap-2">
                        {compact && <PresentationToggle />}
                        <DataGridColumnVisibility
                            table={table}
                            trigger={
                                <Button variant="outline">
                                    <Columns3 />
                                    Spalten
                                </Button>
                            }
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label="Zeilendichte umschalten"
                            aria-pressed={dense}
                            onClick={() => update("dense", !dense)}
                        >
                            <Rows3 />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label={
                                selectedRows.length
                                    ? "Auswahl als CSV exportieren"
                                    : "Aktuelle Seite als CSV exportieren"
                            }
                            disabled={!rows.length}
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
                        {!compact &&
                            resource.filters?.map((filter) => (
                                <Select
                                    key={filter.field}
                                    value={filters[filter.field] ?? "all"}
                                    onValueChange={(v) => {
                                        update(
                                            "filters",
                                            (f) => ({
                                                ...f,
                                                [filter.field]: String(v),
                                            }),
                                            true,
                                        );
                                    }}
                                >
                                    <SelectTrigger aria-label={filter.label}>
                                        <SelectValue>
                                            {(v) =>
                                                v === "all"
                                                    ? filter.label
                                                    : label(v)
                                            }
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            Alle
                                        </SelectItem>
                                        {filter.options.map((o) => (
                                            <SelectItem
                                                key={o.value}
                                                value={o.value}
                                            >
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ))}
                        {!compact && resource.groupBy && (
                            <Select
                                value={group}
                                onValueChange={(v) => {
                                    update("group", String(v), true);
                                }}
                            >
                                <SelectTrigger aria-label="Gruppierung">
                                    <ListFilter />
                                    <SelectValue>
                                        {(v) =>
                                            v === "none"
                                                ? "Gruppieren"
                                                : resource.groupBy?.find(
                                                      (g) => g.value === v,
                                                  )?.label
                                        }
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">
                                        Keine Gruppierung
                                    </SelectItem>
                                    {resource.groupBy.map((g) => (
                                        <SelectItem
                                            key={g.value}
                                            value={g.value}
                                        >
                                            {g.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
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
                        {can(resource.name, "create") && (
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
                {selectedRows.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
                        <span className="mr-auto text-xs font-medium">
                            {selectedRows.length} ausgewählt
                        </span>
                        {bulk.map((a) => (
                            <Button
                                key={a.id}
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    workbench.runAction(a, {
                                        rows: selectedRows,
                                        resource,
                                        instance,
                                    })
                                }
                            >
                                {a.label}
                            </Button>
                        ))}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelection({})}
                        >
                            Auswahl aufheben
                        </Button>
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
                            className={cn(
                                "min-h-0",
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
                                    <DataGridScrollArea
                                        className={
                                            compact ? "max-h-[30rem]" : "h-full"
                                        }
                                        orientation="both"
                                    >
                                        <DataGridTable />
                                    </DataGridScrollArea>
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
