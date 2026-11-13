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
    type PaginationState,
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
import { useNavigate, useSearchParams } from "react-router";
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
}: {
    resource: ResourceDefinition;
    row: RecordData;
    instance?: Partial<ResourceInstance>;
}) {
    const workbench = useWorkbench();
    const actions = resource.actions.filter(
        (a) => a.visible(row) && can(resource.name, a.id, row),
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
}: {
    resource: ResourceDefinition;
    fixedFilters?: Filter[];
    defaults?: Values;
    compact?: boolean;
    onSaved?: () => void | Promise<void>;
    form?: UseFormReturn<Values>;
}) {
    const [url, setUrl] = useSearchParams();
    const navigate = useNavigate();
    const workbench = useWorkbench();
    const reload = useReload();
    const [search, setSearch] = useState(compact ? "" : (url.get("q") ?? ""));
    const query = useDebounced(search);
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: compact ? 0 : Math.max(0, Number(url.get("page") ?? 1) - 1),
        pageSize: compact ? 10 : 25,
    });
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(
        {},
    );
    const [selection, setSelection] = useState<RowSelectionState>({});
    const [group, setGroup] = useState("none");
    const [filters, setFilters] = useState<Record<string, string>>({});
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
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
        filters: apiFilters,
        sort: sort.length ? sort : undefined,
    });
    const rows = result.data?.data ?? [];
    useEffect(() => {
        setSelection({});
    }, [
        query,
        pagination.pageIndex,
        pagination.pageSize,
        group,
        JSON.stringify(filters),
        JSON.stringify(fixedFilters),
    ]);
    useEffect(() => {
        if (!compact)
            setUrl(
                (prev) => {
                    const p = new URLSearchParams(prev);
                    search ? p.set("q", search) : p.delete("q");
                    pagination.pageIndex
                        ? p.set("page", String(pagination.pageIndex + 1))
                        : p.delete("page");
                    return p;
                },
                { replace: true },
            );
    }, [search, pagination.pageIndex, compact, setUrl]);
    const tableRef = useRef<unknown>(null);
    const instance: Partial<ResourceInstance> = {
        reload,
        form,
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
            onSaved,
            wizard: !compact && !!resource.groups,
        });
    const columns = useMemo<ColumnDef<DataGridFeatures, RecordData>[]>(
        () => [
            {
                id: "selection",
                header: () => <DataGridTableRowSelectAll />,
                cell: ({ row }) => <DataGridTableRowSelect row={row} />,
                size: 40,
                enableSorting: false,
                enableHiding: false,
            },
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
                    c.render ? (
                        c.render(row.original)
                    ) : c.field === resource.titleField ? (
                        <button
                            className="font-medium text-foreground hover:text-primary"
                            onClick={() =>
                                navigate(`/${resource.name}/${row.original.id}`)
                            }
                        >
                            {String(row.original[c.field] ?? "—")}
                        </button>
                    ) : c.kind === "currency" ? (
                        money(row.original[c.field])
                    ) : c.kind === "date" ? (
                        date(row.original[c.field])
                    ) : c.kind === "badge" ? (
                        <StatusBadge value={row.original[c.field]} />
                    ) : c.kind === "number" ? (
                        number(row.original[c.field], 2)
                    ) : (
                        String(row.original[c.field] ?? "—")
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
        [resource, navigate, form, onSaved],
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
            pagination,
            sorting,
            rowSelection: selection,
            columnVisibility,
        },
        onColumnVisibilityChange: setColumnVisibility,
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
        onRowSelectionChange: setSelection,
        enableRowSelection: true,
    });
    tableRef.current = table;
    const selectedRows = rows.filter((r) => selection[String(r.id)]);
    const bulk = resource.actions.filter(
        (a) =>
            a.bulk &&
            selectedRows.every((r) => a.visible(r)) &&
            can(resource.name, a.id),
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
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative min-w-48 flex-1 sm:max-w-80">
                    <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPagination((p) => ({ ...p, pageIndex: 0 }));
                        }}
                        className="pl-9"
                        aria-label={`${resource.label} durchsuchen`}
                        placeholder={`${resource.label} durchsuchen …`}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    {!compact &&
                        resource.filters?.map((filter) => (
                            <Select
                                key={filter.field}
                                value={filters[filter.field] ?? "all"}
                                onValueChange={(v) => {
                                    setFilters((f) => ({
                                        ...f,
                                        [filter.field]: String(v),
                                    }));
                                    setPagination((p) => ({
                                        ...p,
                                        pageIndex: 0,
                                    }));
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
                                    <SelectItem value="all">Alle</SelectItem>
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
                                setGroup(String(v));
                                setPagination((p) => ({ ...p, pageIndex: 0 }));
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
                                    <SelectItem key={g.value} value={g.value}>
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
                            className={result.isFetching ? "animate-spin" : ""}
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
                <DataGrid
                    table={table}
                    recordCount={result.data?.total ?? 0}
                    isLoading={result.isPending}
                    i18n={i18n}
                    tableLayout={{ columnsVisibility: true }}
                >
                    {grouped ? (
                        <div className="space-y-4">
                            {Object.entries(grouped).map(([key, items]) => (
                                <section
                                    key={key}
                                    className="overflow-hidden rounded-xl border"
                                >
                                    <div className="flex items-center justify-between bg-muted/50 px-4 py-2 text-xs font-semibold">
                                        <span>{label(key)}</span>
                                        <span className="font-normal text-muted-foreground">
                                            {items!.length} auf dieser Seite
                                        </span>
                                    </div>
                                    <GroupedGrid
                                        columns={columns}
                                        rows={items!}
                                        selection={selection}
                                        onSelection={setSelection}
                                        sorting={sorting}
                                        onSorting={setSorting}
                                        columnVisibility={columnVisibility}
                                        onVisibility={setColumnVisibility}
                                    />
                                </section>
                            ))}
                        </div>
                    ) : (
                        <DataGridContainer>
                            <DataGridTable />
                        </DataGridContainer>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <DataGridColumnVisibility
                            table={table}
                            trigger={
                                <Button variant="ghost" size="sm">
                                    <Columns3 />
                                    Spalten
                                </Button>
                            }
                        />
                        <DataGridPagination />
                    </div>
                </DataGrid>
            )}
        </div>
    );
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
}: {
    columns: ColumnDef<DataGridFeatures, RecordData>[];
    rows: RecordData[];
    selection: RowSelectionState;
    onSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>;
    sorting: SortingState;
    onSorting: React.Dispatch<React.SetStateAction<SortingState>>;
    columnVisibility: ColumnVisibilityState;
    onVisibility: React.Dispatch<React.SetStateAction<ColumnVisibilityState>>;
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
        enableRowSelection: true,
    });
    return (
        <DataGrid table={table} recordCount={rows.length} i18n={i18n}>
            <DataGridTable />
        </DataGrid>
    );
}
