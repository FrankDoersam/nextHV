import { useMemo, useState } from "react";
import {
    Archive,
    Download,
    ListFilter,
    Plus,
    RotateCcw,
    Search,
    Settings2,
    Trash2,
    Users,
    X,
} from "lucide-react";
import {
    useTable,
    type ColumnDef,
    type ColumnFiltersState,
    type ColumnPinningState,
    type ColumnVisibilityState,
    type PaginationState,
    type RowSelectionState,
    type SortingState,
} from "@tanstack/react-table";
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import {
    DataGridTable,
    DataGridTableRowSelect,
    DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridColumnFilter } from "@/components/reui/data-grid/data-grid-column-filter";
import { DataGridColumnVisibility } from "@/components/reui/data-grid/data-grid-column-visibility";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import {
    Frame,
    FrameDescription,
    FrameHeader,
    FramePanel,
    FrameTitle,
} from "@/components/reui/frame";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContactRowActions, type ContactAction } from "./contact-actions";
import { ContactEditor, type ContactDraft } from "./contact-editor";
import { DemoDeleteConfirmation } from "./delete-confirmation";
import {
    demoContactsCsv,
    demoOwners,
    demoStages,
    demoStatuses,
    euro,
    filterAndSortContacts,
    getDemoMetrics,
    initialDemoContacts,
    type DemoContact,
    type DemoStatus,
} from "./demo-contacts";

const statusOptions = demoStatuses.map((value) => ({ label: value, value }));
const stageOptions = demoStages.map((value) => ({ label: value, value }));
const ownerOptions = demoOwners.map((value) => ({ label: value, value }));

function statusVariant(value: DemoStatus) {
    return value === "Aktiv"
        ? "success-light"
        : value === "Lead"
          ? "info-light"
          : "secondary";
}

function downloadDemoCsv(rows: DemoContact[]) {
    const blob = new Blob([demoContactsCsv(rows)], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "reui-demo-contacts.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

/** Full-featured but isolated CRM playground using the existing ReUI DataGrid. */
export function ReuiContactsDemo() {
    const [contacts, setContacts] = useState<DemoContact[]>(() => initialDemoContacts);
    const [search, setSearch] = useState("");
    const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
    const [filters, setFilters] = useState<ColumnFiltersState>([]);
    const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
    const [selection, setSelection] = useState<RowSelectionState>({});
    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({ id: false });
    const [pinning, setPinning] = useState<ColumnPinningState>({
        start: ["selection", "name"],
        end: ["actions"],
    });
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<DemoContact>();
    const [deleteIds, setDeleteIds] = useState<string[]>([]);
    const [notice, setNotice] = useState("");

    const filtered = useMemo(
        () => filterAndSortContacts(contacts, search, filters, sorting),
        [contacts, search, filters, sorting],
    );
    const pageRows = useMemo(
        () => filtered.slice(pagination.pageIndex * pagination.pageSize, (pagination.pageIndex + 1) * pagination.pageSize),
        [filtered, pagination],
    );
    const selectedIds = useMemo(
        () => Object.keys(selection).filter((id) => selection[id] && contacts.some((row) => row.id === id)),
        [contacts, selection],
    );
    const metrics = useMemo(() => getDemoMetrics(contacts), [contacts]);
    const statusFilter = (filters.find((filter) => filter.id === "status")?.value ?? []) as string[];
    const onlyStatus = statusFilter.length === 1 ? statusFilter[0] : "Alle";

    const changeFilters = (next: ColumnFiltersState | ((current: ColumnFiltersState) => ColumnFiltersState)) => {
        setFilters(next);
        setPagination((old) => ({ ...old, pageIndex: 0 }));
        setSelection({});
    };
    const changeSearch = (value: string) => {
        setSearch(value);
        setPagination((old) => ({ ...old, pageIndex: 0 }));
        setSelection({});
    };
    const filterStatus = (status?: DemoStatus) => {
        changeFilters((current) => [
            ...current.filter((filter) => filter.id !== "status"),
            ...(status ? [{ id: "status", value: [status] }] : []),
        ]);
    };

    const nextId = () =>
        "CRM-" + String(
            Math.max(0, ...contacts.map((row) => Number(row.id.replace("CRM-", "")) || 0)) + 1,
        ).padStart(3, "0");

    const openEditor = (contact?: DemoContact) => {
        setEditing(contact);
        setEditorOpen(true);
        setNotice("");
    };
    const saveContact = (draft: ContactDraft, existing?: DemoContact) => {
        if (existing) {
            setContacts((current) => current.map((row) =>
                row.id === existing.id ? { ...row, ...draft } : row,
            ));
            setNotice("Demo-Kontakt aktualisiert.");
        } else {
            setContacts((current) => [
                { ...draft, id: nextId(), createdAt: "2026-11-17" },
                ...current,
            ]);
            setNotice("Demo-Kontakt hinzugefügt.");
        }
        setEditorOpen(false);
        setSelection({});
        setPagination((old) => ({ ...old, pageIndex: 0 }));
    };

    const action = (name: ContactAction, contact: DemoContact) => {
        switch (name) {
            case "edit":
                openEditor(contact);
                break;
            case "duplicate": {
                const copied: DemoContact = {
                    ...contact,
                    id: nextId(),
                    name: contact.name + " (Kopie)",
                    email: "copy-" + nextId().toLowerCase() + "@example.test",
                    createdAt: "2026-11-17",
                };
                setContacts((current) => [copied, ...current]);
                setNotice("Kontakt als Dummy-Datensatz dupliziert.");
                break;
            }
            case "toggle-status":
                setContacts((current) => current.map((row) =>
                    row.id === contact.id
                        ? { ...row, status: row.status === "Inaktiv" ? "Aktiv" : "Inaktiv" }
                        : row,
                ));
                setNotice("Status lokal geändert.");
                break;
            case "delete":
                setDeleteIds([contact.id]);
                break;
        }
    };

    const columns = useMemo<ColumnDef<DataGridFeatures, DemoContact>[]>(() => [
        {
            id: "selection",
            header: () => <DataGridTableRowSelectAll />,
            cell: ({ row }) => <DataGridTableRowSelect row={row} />,
            size: 42,
            minSize: 42,
            maxSize: 42,
            enableSorting: false,
            enableHiding: false,
            enablePinning: false,
            enableResizing: false,
        },
        {
            id: "name",
            accessorFn: (row) => row.name,
            header: ({ column }) => <DataGridColumnHeader column={column} title="Kontakt" />,
            cell: ({ row }) => (
                <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{row.original.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
                </div>
            ),
            size: 220,
            minSize: 160,
            enableHiding: false,
        },
        {
            id: "company",
            accessorFn: (row) => row.company,
            header: ({ column }) => <DataGridColumnHeader column={column} title="Unternehmen" />,
            cell: ({ row }) => <span className="truncate">{row.original.company}</span>,
            size: 150,
        },
        {
            id: "status",
            accessorFn: (row) => row.status,
            header: ({ column }) => <DataGridColumnHeader column={column} title="Status" />,
            cell: ({ row }) => (
                <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>
            ),
            size: 120,
        },
        {
            id: "stage",
            accessorFn: (row) => row.stage,
            header: ({ column }) => <DataGridColumnHeader column={column} title="Phase" />,
            cell: ({ row }) => <span>{row.original.stage}</span>,
            size: 136,
        },
        {
            id: "owner",
            accessorFn: (row) => row.owner,
            header: ({ column }) => <DataGridColumnHeader column={column} title="Zuständig" />,
            cell: ({ row }) => <span className="truncate">{row.original.owner}</span>,
            size: 150,
        },
        {
            id: "source",
            accessorFn: (row) => row.source,
            header: ({ column }) => <DataGridColumnHeader column={column} title="Quelle" />,
            cell: ({ row }) => <span>{row.original.source}</span>,
            size: 120,
        },
        {
            id: "dealValue",
            accessorFn: (row) => row.dealValue,
            header: ({ column }) => <DataGridColumnHeader column={column} title="Potenzial" />,
            cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{euro(row.original.dealValue)}</span>,
            meta: { cellClassName: "text-right" },
            size: 136,
        },
        {
            id: "createdAt",
            accessorFn: (row) => row.createdAt,
            header: ({ column }) => <DataGridColumnHeader column={column} title="Erstellt" />,
            cell: ({ row }) => <span className="tabular-nums">{row.original.createdAt.split("-").reverse().join(".")}</span>,
            size: 125,
        },
        {
            id: "actions",
            header: "",
            cell: ({ row }) => <ContactRowActions contact={row.original} onAction={action} />,
            size: 48,
            minSize: 48,
            maxSize: 48,
            enableSorting: false,
            enableHiding: false,
            enableResizing: false,
        },
    ], [contacts]);

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: pageRows,
        getRowId: (row) => row.id,
        rowCount: filtered.length,
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        state: {
            sorting,
            columnFilters: filters,
            pagination,
            rowSelection: selection,
            columnVisibility,
            columnPinning: pinning,
        },
        onSortingChange: (next) => {
            setSorting(next);
            setPagination((old) => ({ ...old, pageIndex: 0 }));
        },
        onColumnFiltersChange: changeFilters,
        onPaginationChange: setPagination,
        onRowSelectionChange: setSelection,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnPinningChange: setPinning,
        enableRowSelection: true,
        enableMultiRowSelection: true,
    });

    const bulkArchive = () => {
        setContacts((current) => current.map((row) =>
            selectedIds.includes(row.id) ? { ...row, status: "Inaktiv" } : row,
        ));
        setSelection({});
        setNotice(selectedIds.length + " Demo-Kontakte archiviert.");
    };
    const reset = () => {
        setContacts(createFreshRows());
        setSearch("");
        setSorting([{ id: "createdAt", desc: true }]);
        setFilters([]);
        setPagination({ pageIndex: 0, pageSize: 10 });
        setSelection({});
        setColumnVisibility({ id: false });
        setNotice("Demo-Daten zurückgesetzt.");
    };

    return (
        <div data-slot="reui-crm-demo" className="flex min-w-0 flex-col gap-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                    ["Kontakte", String(metrics.total), Users],
                    ["Aktive Kontakte", String(metrics.active), ListFilter],
                    ["Potenzial", euro(metrics.pipeline), Archive],
                ].map(([label, value, Icon]) => {
                    const Graphic = Icon as typeof Users;
                    return (
                        <div key={label as string} className="rounded-2xl border bg-card p-4">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Graphic className="size-4" aria-hidden="true" /> {label as string}
                            </div>
                            <p className="mt-2 text-2xl font-semibold tabular-nums">{value as string}</p>
                        </div>
                    );
                })}
            </div>

            <Frame className="min-w-0" stacked>
                <FrameHeader className="gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-0.5">
                            <FrameTitle>Contacts</FrameTitle>
                            <FrameDescription>Lokale Demo-Daten · REUI DataGrid</FrameDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" type="button" onClick={() => {
                                downloadDemoCsv(filtered);
                                setNotice(filtered.length + " gefilterte Dummy-Kontakte exportiert.");
                            }}>
                                <Download className="size-4" aria-hidden="true" />
                                CSV exportieren
                            </Button>
                            <Button size="sm" type="button" onClick={() => openEditor()}>
                                <Plus className="size-4" aria-hidden="true" />
                                Kontakt hinzufügen
                            </Button>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {(["Alle", ...demoStatuses] as const).map((status) => (
                            <Button
                                key={status}
                                type="button"
                                size="sm"
                                variant={onlyStatus === status ? "secondary" : "ghost"}
                                onClick={() => filterStatus(status === "Alle" ? undefined : status)}
                                aria-pressed={onlyStatus === status}
                            >
                                {status}
                            </Button>
                        ))}
                    </div>
                </FrameHeader>

                <FramePanel className="flex min-w-0 flex-col gap-3">
                    <DataGrid
                        table={table}
                        recordCount={filtered.length}
                        emptyMessage="Keine Kontakte gefunden. Passe die Filter an."
                        tableLayout={{
                            dense: false,
                            headerSticky: true,
                            headerBackground: true,
                            columnsVisibility: true,
                            columnsResizable: true,
                            columnsPinnable: true,
                            columnsMovable: true,
                            cellSelection: true,
                            cellBorder: false,
                            width: "fixed",
                        }}
                        onCellsCopy={() => setNotice("Ausgewählte Zellen in die Zwischenablage kopiert.")}
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    type="search"
                                    aria-label="Kontakte durchsuchen"
                                    placeholder="Name, E-Mail, Unternehmen …"
                                    className="pl-9"
                                    value={search}
                                    onChange={(event) => changeSearch(event.target.value)}
                                />
                            </div>
                            <DataGridColumnFilter column={table.getColumn("status")} title="Status" options={statusOptions} />
                            <DataGridColumnFilter column={table.getColumn("stage")} title="Phase" options={stageOptions} />
                            <DataGridColumnFilter column={table.getColumn("owner")} title="Zuständig" options={ownerOptions} />
                            <DataGridColumnVisibility
                                table={table}
                                trigger={<Button variant="outline" size="sm" type="button"><Settings2 className="size-4" /> Spalten</Button>}
                            />
                            {(search || filters.length > 0) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    type="button"
                                    onClick={() => { changeSearch(""); setFilters([]); }}
                                >
                                    <X className="size-4" />
                                    Zurücksetzen
                                </Button>
                            )}
                        </div>

                        {selectedIds.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-2.5 text-sm">
                                <Badge variant="primary-light">{selectedIds.length} ausgewählt</Badge>
                                <Button size="sm" variant="outline" type="button" onClick={bulkArchive}>
                                    <Archive className="size-4" /> Archivieren
                                </Button>
                                <Button size="sm" variant="outline" type="button" onClick={() => {
                                    downloadDemoCsv(contacts.filter((row) => selectedIds.includes(row.id)));
                                    setNotice("Auswahl als CSV exportiert.");
                                }}>
                                    <Download className="size-4" /> Auswahl exportieren
                                </Button>
                                <Button size="sm" variant="destructive" type="button" onClick={() => setDeleteIds(selectedIds)}>
                                    <Trash2 className="size-4" /> Auswahl löschen
                                </Button>
                                <Button size="sm" variant="ghost" type="button" onClick={() => setSelection({})}>
                                    Auswahl aufheben
                                </Button>
                            </div>
                        )}

                        <DataGridContainer>
                            <DataGridTable />
                        </DataGridContainer>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                            <span className="text-xs text-muted-foreground">
                                {filtered.length} Treffer · {contacts.length} Demo-Datensätze
                            </span>
                            <DataGridPagination compact sizes={[10, 20, 50]} />
                        </div>
                    </DataGrid>
                </FramePanel>
            </Frame>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                    Alle Änderungen gelten nur auf dieser Seite. Kein API-Zugriff auf nextHV.
                </span>
                <Button type="button" variant="outline" size="sm" onClick={reset}>
                    <RotateCcw className="size-4" /> Demo zurücksetzen
                </Button>
            </div>
            {notice && <p role="status" className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">{notice}</p>}

            <ContactEditor
                open={editorOpen}
                contact={editing}
                onClose={() => setEditorOpen(false)}
                onSave={saveContact}
            />
            <DemoDeleteConfirmation
                count={deleteIds.length}
                onCancel={() => setDeleteIds([])}
                onConfirm={() => {
                    const removing = new Set(deleteIds);
                    setContacts((current) => current.filter((row) => !removing.has(row.id)));
                    setSelection({});
                    setNotice(deleteIds.length + " Demo-Kontakte gelöscht.");
                    setDeleteIds([]);
                }}
            />
        </div>
    );
}

function createFreshRows() {
    return initialDemoContacts.map((row) => ({ ...row }));
}
