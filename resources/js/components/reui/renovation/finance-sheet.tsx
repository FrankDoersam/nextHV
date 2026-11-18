import { useEffect, useMemo, useState } from "react";
import {
    Check,
    CreditCard,
    FilePlus2,
    Pencil,
    Plus,
    Receipt,
    ShoppingCart,
    Wallet,
    X,
} from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Alert, AlertDescription } from "@/components/reui/alert";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    Sheet,
    SheetActions,
    SheetBody,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetHeading,
    SheetSection,
    SheetTabBar,
    SheetTabTrigger,
    SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    addInvoice,
    addOrder,
    centsFromEuro,
    euro,
    financeStatus,
    financeTotals,
    setBudget,
    type FinanceState,
    type IncomingInvoice,
    type PurchaseOrder,
    type OrderStatus,
} from "@/lib/renovation/finance";
import {
    humanDate,
    humanFinish,
    TRADES,
    type ScheduledTask,
} from "@/lib/renovation/plan";

const orderLabels: Record<OrderStatus, string> = {
    entwurf: "Entwurf",
    bestellt: "Bestellt",
    teilgeliefert: "Teillieferung",
    geliefert: "Geliefert",
    storniert: "Storniert",
};
const orderVariants = {
    entwurf: "secondary",
    bestellt: "info-light",
    teilgeliefert: "warning-light",
    geliefert: "success-light",
    storniert: "destructive-light",
} as const;
const invoiceLabels = {
    bezahlt: "Bezahlt",
    teilbezahlt: "Teilbezahlt",
    offen: "Offen",
    pruefung: "In Prüfung",
};
const invoiceVariants = {
    bezahlt: "success-light",
    teilbezahlt: "warning-light",
    offen: "destructive-light",
    pruefung: "secondary",
} as const;

function FormRow({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            {label}
            {children}
        </label>
    );
}
const moneyInput = (value: number) =>
    (value / 100).toFixed(2).replace(".", ",");
const nextNumber = (prefix: string, rows: { id: string }[]) =>
    prefix +
    String(
        Math.max(0, ...rows.map((r) => Number(r.id.replace(prefix, "")) || 0)) +
            1,
    ).padStart(3, "0");

export function FinanceSheet({
    open,
    onOpenChange,
    taskId,
    tasks,
    state,
    onChange,
    onEditTask,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    taskId: string | null;
    tasks: ScheduledTask[];
    state: FinanceState;
    onChange: (state: FinanceState) => void;
    onEditTask: (id: string) => void;
}) {
    const [scope, setScope] = useState<string>("all");
    const [tab, setTab] = useState("budget");
    const [onlyOpen, setOnlyOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<string | null>(null);
    const [budgetDraft, setBudgetDraft] = useState("");
    const [addMode, setAddMode] = useState<"order" | "invoice" | null>(null);
    const [formError, setFormError] = useState("");
    const [pendingPayment, setPendingPayment] = useState<string | null>(null);
    const [orderDraft, setOrderDraft] = useState({
        taskId: "",
        supplier: "",
        description: "",
        orderedAt: "2027-03-01",
        expectedAt: "2027-04-01",
        amount: "0,00",
    });
    const [invoiceDraft, setInvoiceDraft] = useState({
        taskId: "",
        supplier: "",
        invoiceNumber: "",
        receivedAt: "2027-03-01",
        dueAt: "2027-04-01",
        amount: "0,00",
    });
    useEffect(() => {
        if (open) {
            setScope(taskId ?? "all");
            setTab(taskId ? "position" : "budget");
            setAddMode(null);
            setFormError("");
            setEditingBudget(null);
        }
    }, [open, taskId]);
    const current =
        scope === "all" ? undefined : tasks.find((t) => t.id === scope);
    const scopedOrders = useMemo(
        () => state.orders.filter((o) => scope === "all" || o.taskId === scope),
        [state.orders, scope],
    );
    const scopedInvoices = useMemo(
        () =>
            state.invoices.filter((i) => scope === "all" || i.taskId === scope),
        [state.invoices, scope],
    );
    const scopedBudgets = useMemo(
        () =>
            state.budgets.filter((b) => scope === "all" || b.taskId === scope),
        [state.budgets, scope],
    );
    const totals = financeTotals(state, scope === "all" ? undefined : scope);
    const unpaid = scopedInvoices.filter((i) => i.amountCents > i.paidCents);
    const selectedInvoice = state.invoices.find((i) => i.id === pendingPayment);
    const displayInvoices = onlyOpen ? unpaid : scopedInvoices;
    const taskName = (id: string) =>
        tasks.find((t) => t.id === id)?.title ?? "Position";
    const updateBudget = (taskId: string) => {
        const cents = centsFromEuro(budgetDraft);
        try {
            onChange(setBudget(state, taskId, cents));
            setEditingBudget(null);
            setFormError("");
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Budget ungültig.");
        }
    };
    const beginAdd = (type: "order" | "invoice") => {
        const selected = scope === "all" ? (tasks[0]?.id ?? "") : scope;
        setOrderDraft({
            taskId: selected,
            supplier: "",
            description: "",
            orderedAt: "2027-03-01",
            expectedAt: "2027-04-01",
            amount: "0,00",
        });
        setInvoiceDraft({
            taskId: selected,
            supplier: "",
            invoiceNumber: "",
            receivedAt: "2027-03-01",
            dueAt: "2027-04-01",
            amount: "0,00",
        });
        setFormError("");
        setAddMode(type);
    };
    const saveOrder = (event: React.FormEvent) => {
        event.preventDefault();
        try {
            const entry: PurchaseOrder = {
                ...orderDraft,
                id: nextNumber("BE-2027-", state.orders),
                amountCents: centsFromEuro(orderDraft.amount),
                status: "bestellt",
            };
            if (!tasks.some((t) => t.id === entry.taskId))
                throw new Error("Position auswählen.");
            onChange(addOrder(state, entry));
            setAddMode(null);
            setFormError("");
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : "Bestellung ungültig.",
            );
        }
    };
    const saveInvoice = (event: React.FormEvent) => {
        event.preventDefault();
        try {
            const entry: IncomingInvoice = {
                ...invoiceDraft,
                id: nextNumber("ER-2027-", state.invoices),
                amountCents: centsFromEuro(invoiceDraft.amount),
                paidCents: 0,
                stage: "pruefung",
            };
            if (!tasks.some((t) => t.id === entry.taskId))
                throw new Error("Position auswählen.");
            onChange(addInvoice(state, entry));
            setAddMode(null);
            setFormError("");
        } catch (err) {
            setFormError(
                err instanceof Error
                    ? err.message
                    : "Eingangsrechnung ungültig.",
            );
        }
    };
    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent size="wide" showCloseButton={false}>
                    <SheetHeader>
                        <SheetHeading
                            title={
                                <SheetTitle>
                                    {current
                                        ? current.title
                                        : "Projektfinanzen"}
                                </SheetTitle>
                            }
                            description={
                                <SheetDescription>
                                    Budget · Bestellungen · Eingangsrechnungen
                                </SheetDescription>
                            }
                            badge={
                                <Badge variant="outline">EUR · brutto</Badge>
                            }
                            actions={
                                <SheetActions>
                                    <SheetClose
                                        render={
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label="Schließen"
                                            />
                                        }
                                    >
                                        <X />
                                    </SheetClose>
                                </SheetActions>
                            }
                        />
                    </SheetHeader>
                    <SheetBody>
                        <div className="space-y-1.5">
                            <label
                                className="text-xs font-medium text-muted-foreground"
                                htmlFor="finance-position"
                            >
                                Position
                            </label>
                            <Select
                                value={scope}
                                onValueChange={(value) => {
                                    if (value) {
                                        setScope(value);
                                        setTab(
                                            value === "all"
                                                ? "budget"
                                                : "position",
                                        );
                                        setAddMode(null);
                                    }
                                }}
                            >
                                <SelectTrigger
                                    id="finance-position"
                                    className="w-full"
                                >
                                    <SelectValue>
                                        {scope === "all"
                                            ? "Gesamtes Projekt"
                                            : (current?.title ?? scope)}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent
                                    alignItemWithTrigger={false}
                                    align="start"
                                    className="max-h-72"
                                >
                                    <SelectItem value="all">
                                        Gesamtes Projekt
                                    </SelectItem>
                                    {tasks.map((task) => (
                                        <SelectItem
                                            value={task.id}
                                            key={task.id}
                                        >
                                            {task.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                            {[
                                {
                                    label: "Planbudget",
                                    value: totals.budget,
                                    icon: Wallet,
                                },
                                {
                                    label: "Beauftragt",
                                    value: totals.ordered,
                                    icon: ShoppingCart,
                                },
                                {
                                    label: "Fakturiert",
                                    value: totals.invoiced,
                                    icon: Receipt,
                                },
                                {
                                    label: "Offen",
                                    value: totals.open,
                                    icon: CreditCard,
                                },
                            ].map((metric) => {
                                const Icon = metric.icon;
                                return (
                                    <SheetSection
                                        key={metric.label}
                                        description={metric.label}
                                        actions={
                                            <Icon
                                                className="size-4"
                                                aria-hidden="true"
                                            />
                                        }
                                    >
                                        <strong className="truncate text-base font-semibold tabular-nums sm:text-lg">
                                            {euro(metric.value)}
                                        </strong>
                                    </SheetSection>
                                );
                            })}
                        </div>
                        <SheetSection title="Freies Budget">
                            <strong
                                className={
                                    "text-base tabular-nums " +
                                    (totals.free < 0
                                        ? "text-destructive"
                                        : "text-foreground")
                                }
                            >
                                {euro(totals.free)}
                            </strong>
                        </SheetSection>
                        <Tabs
                            value={tab}
                            onValueChange={(value) => {
                                setTab(value);
                                setAddMode(null);
                                setFormError("");
                            }}
                            className="min-w-0 gap-3"
                        >
                            <SheetTabBar inset={false}>
                                {current && (
                                    <SheetTabTrigger value="position">
                                        Position
                                    </SheetTabTrigger>
                                )}
                                <SheetTabTrigger value="budget">
                                    Budget{" "}
                                    <Badge variant="secondary" size="sm">
                                        {scopedBudgets.length}
                                    </Badge>
                                </SheetTabTrigger>
                                <SheetTabTrigger value="orders">
                                    Bestellungen{" "}
                                    <Badge variant="info-light" size="sm">
                                        {scopedOrders.length}
                                    </Badge>
                                </SheetTabTrigger>
                                <SheetTabTrigger value="invoices">
                                    Rechnungen{" "}
                                    <Badge
                                        variant={
                                            unpaid.length
                                                ? "warning-light"
                                                : "secondary"
                                        }
                                        size="sm"
                                    >
                                        {unpaid.length} offen
                                    </Badge>
                                </SheetTabTrigger>
                            </SheetTabBar>
                            {current && (
                                <TabsContent
                                    value="position"
                                    className="space-y-4"
                                >
                                    <SheetSection
                                        title={current.title}
                                        description={
                                            TRADES[current.trade].label
                                        }
                                        actions={
                                            <Badge variant="outline">
                                                {current.duration}{" "}
                                                {current.mode === "kalendertage"
                                                    ? "Kalendertage"
                                                    : "Arbeitstage"}
                                            </Badge>
                                        }
                                    >
                                        <p className="text-muted-foreground">
                                            {current.description}
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <span className="text-xs text-muted-foreground">
                                                    Start
                                                </span>
                                                <p className="font-medium">
                                                    {humanDate(current.start)}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-muted-foreground">
                                                    Ende
                                                </span>
                                                <p className="font-medium">
                                                    {humanFinish(current)}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                onEditTask(current.id)
                                            }
                                        >
                                            <Pencil
                                                className="size-4"
                                                aria-hidden="true"
                                            />{" "}
                                            Vorgang bearbeiten
                                        </Button>
                                    </SheetSection>
                                    <div className="grid grid-cols-2 gap-2">
                                        <SheetSection title="Verpflichtet / fakturiert">
                                            <p className="font-medium tabular-nums">
                                                {euro(totals.exposure)}
                                            </p>
                                        </SheetSection>
                                        <SheetSection title="Verfügbar">
                                            <p
                                                className={
                                                    "font-medium tabular-nums " +
                                                    (totals.free < 0
                                                        ? "text-destructive"
                                                        : "")
                                                }
                                            >
                                                {euro(totals.free)}
                                            </p>
                                        </SheetSection>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Vorgänger:{" "}
                                        {current.dependsOn.length
                                            ? current.dependsOn
                                                  .map(taskName)
                                                  .join(" · ")
                                            : "—"}
                                    </div>
                                </TabsContent>
                            )}
                            <TabsContent
                                value="budget"
                                className="min-w-0 space-y-3"
                            >
                                <p className="text-xs text-muted-foreground">
                                    Budget, Verpflichtungen und verfügbare
                                    Mittel pro Position · brutto.
                                </p>
                                <SheetSection inset={false}>
                                    <Table className="min-w-[600px]">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Position</TableHead>
                                                <TableHead className="text-right">
                                                    Budget
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    Gebunden
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    Frei
                                                </TableHead>
                                                <TableHead className="w-14"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {scopedBudgets.map((row) => {
                                                const m = financeTotals(
                                                    state,
                                                    row.taskId,
                                                );
                                                return (
                                                    <TableRow key={row.taskId}>
                                                        <TableCell
                                                            className="max-w-52 truncate font-medium"
                                                            title={taskName(
                                                                row.taskId,
                                                            )}
                                                        >
                                                            {taskName(
                                                                row.taskId,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {editingBudget ===
                                                            row.taskId ? (
                                                                <Input
                                                                    autoFocus
                                                                    className="ml-auto w-28 text-right"
                                                                    aria-label={
                                                                        "Budget " +
                                                                        taskName(
                                                                            row.taskId,
                                                                        )
                                                                    }
                                                                    value={
                                                                        budgetDraft
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        setBudgetDraft(
                                                                            e
                                                                                .target
                                                                                .value,
                                                                        )
                                                                    }
                                                                    onKeyDown={(
                                                                        e,
                                                                    ) => {
                                                                        if (
                                                                            e.key ===
                                                                            "Enter"
                                                                        )
                                                                            updateBudget(
                                                                                row.taskId,
                                                                            );
                                                                        if (
                                                                            e.key ===
                                                                            "Escape"
                                                                        )
                                                                            setEditingBudget(
                                                                                null,
                                                                            );
                                                                    }}
                                                                />
                                                            ) : (
                                                                euro(
                                                                    row.budgetCents,
                                                                )
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {euro(m.exposure)}
                                                        </TableCell>
                                                        <TableCell
                                                            className={
                                                                "text-right tabular-nums " +
                                                                (m.free < 0
                                                                    ? "font-medium text-destructive"
                                                                    : "")
                                                            }
                                                        >
                                                            {euro(m.free)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {editingBudget ===
                                                            row.taskId ? (
                                                                <Button
                                                                    size="icon-sm"
                                                                    variant="ghost"
                                                                    aria-label="Budget speichern"
                                                                    onClick={() =>
                                                                        updateBudget(
                                                                            row.taskId,
                                                                        )
                                                                    }
                                                                >
                                                                    <Check className="size-4" />
                                                                </Button>
                                                            ) : (
                                                                <Button
                                                                    size="icon-sm"
                                                                    variant="ghost"
                                                                    aria-label={
                                                                        "Budget bearbeiten: " +
                                                                        taskName(
                                                                            row.taskId,
                                                                        )
                                                                    }
                                                                    onClick={() => {
                                                                        setEditingBudget(
                                                                            row.taskId,
                                                                        );
                                                                        setBudgetDraft(
                                                                            moneyInput(
                                                                                row.budgetCents,
                                                                            ),
                                                                        );
                                                                    }}
                                                                >
                                                                    <Pencil className="size-4" />
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </SheetSection>
                            </TabsContent>
                            <TabsContent value="orders" className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium">
                                        {scopedOrders.length} Bestellungen
                                    </p>
                                    <Button
                                        size="sm"
                                        onClick={() => beginAdd("order")}
                                    >
                                        <Plus className="size-4" /> Bestellung
                                    </Button>
                                </div>
                                {addMode === "order" && (
                                    <SheetSection title="Bestellung erfassen">
                                        <form
                                            onSubmit={saveOrder}
                                            className="grid gap-3 sm:grid-cols-2"
                                        >
                                            <FormRow label="Position">
                                                <Select
                                                    value={orderDraft.taskId}
                                                    onValueChange={(v) =>
                                                        v &&
                                                        setOrderDraft({
                                                            ...orderDraft,
                                                            taskId: v,
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue>
                                                            {tasks.find(
                                                                (task) =>
                                                                    task.id ===
                                                                    orderDraft.taskId,
                                                            )?.title ??
                                                                orderDraft.taskId}
                                                        </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent
                                                        alignItemWithTrigger={
                                                            false
                                                        }
                                                    >
                                                        {tasks.map((t) => (
                                                            <SelectItem
                                                                value={t.id}
                                                                key={t.id}
                                                            >
                                                                {t.title}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </FormRow>
                                            <FormRow label="Lieferant">
                                                <Input
                                                    required
                                                    value={orderDraft.supplier}
                                                    onChange={(e) =>
                                                        setOrderDraft({
                                                            ...orderDraft,
                                                            supplier:
                                                                e.target.value,
                                                        })
                                                    }
                                                />
                                            </FormRow>
                                            <FormRow label="Leistung">
                                                <Input
                                                    required
                                                    value={
                                                        orderDraft.description
                                                    }
                                                    onChange={(e) =>
                                                        setOrderDraft({
                                                            ...orderDraft,
                                                            description:
                                                                e.target.value,
                                                        })
                                                    }
                                                />
                                            </FormRow>
                                            <FormRow label="Betrag brutto (EUR)">
                                                <Input
                                                    required
                                                    inputMode="decimal"
                                                    value={orderDraft.amount}
                                                    onChange={(e) =>
                                                        setOrderDraft({
                                                            ...orderDraft,
                                                            amount: e.target
                                                                .value,
                                                        })
                                                    }
                                                />
                                            </FormRow>
                                            <FormRow label="Bestellt am">
                                                <Input
                                                    type="date"
                                                    required
                                                    value={orderDraft.orderedAt}
                                                    onChange={(e) =>
                                                        setOrderDraft({
                                                            ...orderDraft,
                                                            orderedAt:
                                                                e.target.value,
                                                        })
                                                    }
                                                />
                                            </FormRow>
                                            <FormRow label="Liefertermin">
                                                <Input
                                                    type="date"
                                                    required
                                                    value={
                                                        orderDraft.expectedAt
                                                    }
                                                    onChange={(e) =>
                                                        setOrderDraft({
                                                            ...orderDraft,
                                                            expectedAt:
                                                                e.target.value,
                                                        })
                                                    }
                                                />
                                            </FormRow>
                                            <div className="flex justify-end gap-2 sm:col-span-2">
                                                <Button
                                                    variant="outline"
                                                    type="button"
                                                    onClick={() =>
                                                        setAddMode(null)
                                                    }
                                                >
                                                    Abbrechen
                                                </Button>
                                                <Button type="submit">
                                                    Bestellung anlegen
                                                </Button>
                                            </div>
                                        </form>
                                    </SheetSection>
                                )}
                                <SheetSection inset={false}>
                                    <Table className="min-w-[660px]">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>
                                                    Nr. / Lieferant
                                                </TableHead>
                                                <TableHead>Position</TableHead>
                                                <TableHead>Lieferung</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">
                                                    Betrag
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {scopedOrders.length ? (
                                                scopedOrders.map((order) => (
                                                    <TableRow key={order.id}>
                                                        <TableCell>
                                                            <p className="font-semibold">
                                                                {order.id}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {order.supplier}
                                                            </p>
                                                        </TableCell>
                                                        <TableCell
                                                            className="max-w-44 truncate"
                                                            title={taskName(
                                                                order.taskId,
                                                            )}
                                                        >
                                                            {taskName(
                                                                order.taskId,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="tabular-nums">
                                                            {order.expectedAt
                                                                .split("-")
                                                                .reverse()
                                                                .join(".")}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge
                                                                variant={
                                                                    orderVariants[
                                                                        order
                                                                            .status
                                                                    ]
                                                                }
                                                            >
                                                                {
                                                                    orderLabels[
                                                                        order
                                                                            .status
                                                                    ]
                                                                }
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium tabular-nums">
                                                            {euro(
                                                                order.amountCents,
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={5}
                                                        className="py-8 text-center text-muted-foreground"
                                                    >
                                                        Keine Bestellungen
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </SheetSection>
                            </TabsContent>
                            <TabsContent value="invoices" className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium">
                                            Eingangsrechnungen
                                        </p>
                                        <Button
                                            size="sm"
                                            variant={
                                                onlyOpen
                                                    ? "secondary"
                                                    : "outline"
                                            }
                                            onClick={() =>
                                                setOnlyOpen((v) => !v)
                                            }
                                            aria-pressed={onlyOpen}
                                        >
                                            Nur offene
                                        </Button>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => beginAdd("invoice")}
                                    >
                                        <FilePlus2 className="size-4" />{" "}
                                        Rechnung
                                    </Button>
                                </div>
                                {addMode === "invoice" && (
                                    <SheetSection title="Eingangsrechnung erfassen">
                                        <form
                                            onSubmit={saveInvoice}
                                            className="grid gap-3 sm:grid-cols-2"
                                        >
                                            <FormRow label="Position">
                                                <Select
                                                    value={invoiceDraft.taskId}
                                                    onValueChange={(v) =>
                                                        v &&
                                                        setInvoiceDraft({
                                                            ...invoiceDraft,
                                                            taskId: v,
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue>
                                                            {tasks.find(
                                                                (task) =>
                                                                    task.id ===
                                                                    invoiceDraft.taskId,
                                                            )?.title ??
                                                                invoiceDraft.taskId}
                                                        </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent
                                                        alignItemWithTrigger={
                                                            false
                                                        }
                                                    >
                                                        {tasks.map((t) => (
                                                            <SelectItem
                                                                key={t.id}
                                                                value={t.id}
                                                            >
                                                                {t.title}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </FormRow>
                                            <FormRow label="Lieferant">
                                                <Input
                                                    required
                                                    value={
                                                        invoiceDraft.supplier
                                                    }
                                                    onChange={(e) =>
                                                        setInvoiceDraft({
                                                            ...invoiceDraft,
                                                            supplier:
                                                                e.target.value,
                                                        })
                                                    }
                                                />
                                            </FormRow>
                                            <FormRow label="Rechnungsnummer">
                                                <Input
                                                    required
                                                    value={
                                                        invoiceDraft.invoiceNumber
                                                    }
                                                    onChange={(e) =>
                                                        setInvoiceDraft({
                                                            ...invoiceDraft,
                                                            invoiceNumber:
                                                                e.target.value,
                                                        })
                                                    }
                                                />
                                            </FormRow>
                                            <FormRow label="Betrag brutto (EUR)">
                                                <Input
                                                    required
                                                    inputMode="decimal"
                                                    value={invoiceDraft.amount}
                                                    onChange={(e) =>
                                                        setInvoiceDraft({
                                                            ...invoiceDraft,
                                                            amount: e.target
                                                                .value,
                                                        })
                                                    }
                                                />
                                            </FormRow>
                                            <FormRow label="Eingang">
                                                <Input
                                                    required
                                                    type="date"
                                                    value={
                                                        invoiceDraft.receivedAt
                                                    }
                                                    onChange={(e) =>
                                                        setInvoiceDraft({
                                                            ...invoiceDraft,
                                                            receivedAt:
                                                                e.target.value,
                                                        })
                                                    }
                                                />
                                            </FormRow>
                                            <FormRow label="Fällig">
                                                <Input
                                                    required
                                                    type="date"
                                                    value={invoiceDraft.dueAt}
                                                    onChange={(e) =>
                                                        setInvoiceDraft({
                                                            ...invoiceDraft,
                                                            dueAt: e.target
                                                                .value,
                                                        })
                                                    }
                                                />
                                            </FormRow>
                                            <div className="flex justify-end gap-2 sm:col-span-2">
                                                <Button
                                                    variant="outline"
                                                    type="button"
                                                    onClick={() =>
                                                        setAddMode(null)
                                                    }
                                                >
                                                    Abbrechen
                                                </Button>
                                                <Button type="submit">
                                                    Rechnung erfassen
                                                </Button>
                                            </div>
                                        </form>
                                    </SheetSection>
                                )}
                                <SheetSection inset={false}>
                                    <Table className="min-w-[700px]">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>
                                                    Nr. / Lieferant
                                                </TableHead>
                                                <TableHead>Position</TableHead>
                                                <TableHead>Fällig</TableHead>
                                                <TableHead className="text-right">
                                                    Betrag
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    Offen
                                                </TableHead>
                                                <TableHead>
                                                    Status / Aktion
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {displayInvoices.length ? (
                                                displayInvoices.map(
                                                    (invoice) => {
                                                        const status =
                                                            financeStatus(
                                                                invoice,
                                                            );
                                                        return (
                                                            <TableRow
                                                                key={invoice.id}
                                                            >
                                                                <TableCell>
                                                                    <p className="font-semibold">
                                                                        {
                                                                            invoice.invoiceNumber
                                                                        }
                                                                    </p>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {
                                                                            invoice.supplier
                                                                        }
                                                                    </p>
                                                                </TableCell>
                                                                <TableCell
                                                                    className="max-w-40 truncate"
                                                                    title={taskName(
                                                                        invoice.taskId,
                                                                    )}
                                                                >
                                                                    {taskName(
                                                                        invoice.taskId,
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="tabular-nums">
                                                                    {invoice.dueAt
                                                                        .split(
                                                                            "-",
                                                                        )
                                                                        .reverse()
                                                                        .join(
                                                                            ".",
                                                                        )}
                                                                </TableCell>
                                                                <TableCell className="text-right tabular-nums">
                                                                    {euro(
                                                                        invoice.amountCents,
                                                                    )}
                                                                </TableCell>
                                                                <TableCell
                                                                    className={
                                                                        "text-right font-medium tabular-nums " +
                                                                        (invoice.amountCents >
                                                                        invoice.paidCents
                                                                            ? "text-destructive"
                                                                            : "")
                                                                    }
                                                                >
                                                                    {euro(
                                                                        invoice.amountCents -
                                                                            invoice.paidCents,
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <Badge
                                                                            variant={
                                                                                invoiceVariants[
                                                                                    status
                                                                                ]
                                                                            }
                                                                        >
                                                                            {
                                                                                invoiceLabels[
                                                                                    status
                                                                                ]
                                                                            }
                                                                        </Badge>
                                                                        {status !==
                                                                            "bezahlt" && (
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() =>
                                                                                    setPendingPayment(
                                                                                        invoice.id,
                                                                                    )
                                                                                }
                                                                            >
                                                                                Ausgleichen
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    },
                                                )
                                            ) : (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={6}
                                                        className="py-8 text-center text-muted-foreground"
                                                    >
                                                        Keine offenen
                                                        Eingangsrechnungen
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </SheetSection>
                            </TabsContent>
                        </Tabs>
                        {formError && (
                            <Alert variant="destructive">
                                <AlertDescription>{formError}</AlertDescription>
                            </Alert>
                        )}
                    </SheetBody>
                </SheetContent>
            </Sheet>
            <AlertDialog
                open={!!pendingPayment}
                onOpenChange={(v) => {
                    if (!v) setPendingPayment(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Zahlung dokumentieren?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {selectedInvoice
                                ? selectedInvoice.invoiceNumber +
                                  " · " +
                                  euro(
                                      selectedInvoice.amountCents -
                                          selectedInvoice.paidCents,
                                  )
                                : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (selectedInvoice)
                                    onChange({
                                        ...state,
                                        invoices: state.invoices.map((i) =>
                                            i.id === selectedInvoice.id
                                                ? {
                                                      ...i,
                                                      paidCents: i.amountCents,
                                                      stage: "freigegeben",
                                                  }
                                                : i,
                                        ),
                                    });
                                setPendingPayment(null);
                            }}
                        >
                            Als ausgeglichen markieren
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
