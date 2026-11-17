import { DEFAULT_TASKS, type RenovationTask } from "@/lib/renovation/plan";

/** Currency values are gross euro cents. Never use floating point for totals. */
export type Money = number;
export type OrderStatus = "entwurf" | "bestellt" | "teilgeliefert" | "geliefert" | "storniert";
export type InvoiceStage = "pruefung" | "freigegeben";

export interface PositionBudget {
    taskId: string;
    budgetCents: Money;
}
export interface PurchaseOrder {
    id: string;
    taskId: string;
    supplier: string;
    description: string;
    orderedAt: string;
    expectedAt: string;
    amountCents: Money;
    status: OrderStatus;
}
export interface IncomingInvoice {
    id: string;
    taskId: string;
    purchaseOrderId?: string;
    supplier: string;
    invoiceNumber: string;
    receivedAt: string;
    dueAt: string;
    amountCents: Money;
    paidCents: Money;
    stage: InvoiceStage;
}
export interface FinanceState {
    budgets: PositionBudget[];
    orders: PurchaseOrder[];
    invoices: IncomingInvoice[];
}
export interface FinanceTotals {
    budget: Money;
    ordered: Money;
    invoiced: Money;
    paid: Money;
    open: Money;
    exposure: Money;
    free: Money;
}

export const euro = (value: Money): string =>
    new Intl.NumberFormat("de-DE", { style:"currency", currency:"EUR" }).format(value / 100);

const byTrade: Record<string, number> = {
    Vorbereitung: 150000, Rückbau: 290000, Fensterbau: 980000, Elektro: 560000,
    Sanitär: 850000, Estrich: 680000, Ausbau: 410000, Abschluss: 125000,
};
const overrides: Record<string, number> = {
    "einrichten":90000, "tapeten":60000, "boden-alt":140000, "estrich-alt":330000,
    "fenster-aufmass":55000,"fenster-lieferung":0,"fenster-neu":1380000,
    "fensterbaenke":240000,"elektro-roh":1350000,"sanitaer-roh":1050000,
    "daemmung":470000,"fussbodenheizung":1750000,"druckprobe":190000,
    "estrich-neu":1250000,"estrich-trocknung":0,"funktionsheizen":260000,
    "belegreife":175000,"boden-neu":1450000,"fliesen":940000,
    "maler":730000,"abnahme":180000,
};

export function initialFinance(tasks: RenovationTask[] = DEFAULT_TASKS): FinanceState {
    const budgets = tasks.map((task) => ({
        taskId: task.id,
        budgetCents: overrides[task.id] ?? byTrade[task.trade] ?? 250000,
    }));
    return {
        budgets,
        orders: [
            { id:"BE-2027-001",taskId:"fenster-neu",supplier:"Fensterbau Süd GmbH",description:"Fenster inkl. Montage",orderedAt:"2027-03-02",expectedAt:"2027-03-25",amountCents:1285000,status:"bestellt" },
            { id:"BE-2027-002",taskId:"fussbodenheizung",supplier:"Thermoplan Haustechnik",description:"FBH, Verteiler und Montage",orderedAt:"2027-03-04",expectedAt:"2027-04-06",amountCents:1620000,status:"bestellt" },
            { id:"BE-2027-003",taskId:"estrich-neu",supplier:"Estrichbau Martin KG",description:"Zementestrich 78 m²",orderedAt:"2027-03-10",expectedAt:"2027-04-12",amountCents:1180000,status:"bestellt" },
            { id:"BE-2027-004",taskId:"boden-neu",supplier:"Parkett & Design GmbH",description:"Parkett / Untergrund",orderedAt:"2027-03-19",expectedAt:"2027-05-02",amountCents:1199000,status:"bestellt" },
            { id:"BE-2027-005",taskId:"elektro-roh",supplier:"Elektro Schneider GmbH",description:"Leitungen und Unterverteilung",orderedAt:"2027-03-08",expectedAt:"2027-03-19",amountCents:1075000,status:"teilgeliefert" },
        ],
        invoices: [
            { id:"ER-2027-001",taskId:"elektro-roh",purchaseOrderId:"BE-2027-005",supplier:"Elektro Schneider GmbH",invoiceNumber:"RE-27045",receivedAt:"2027-03-19",dueAt:"2027-04-02",amountCents:420000,paidCents:0,stage:"freigegeben" },
            { id:"ER-2027-002",taskId:"fenster-neu",purchaseOrderId:"BE-2027-001",supplier:"Fensterbau Süd GmbH",invoiceNumber:"AR-2027-088",receivedAt:"2027-03-06",dueAt:"2027-03-20",amountCents:390000,paidCents:0,stage:"freigegeben" },
            { id:"ER-2027-003",taskId:"fussbodenheizung",purchaseOrderId:"BE-2027-002",supplier:"Thermoplan Haustechnik",invoiceNumber:"RE-2027-219",receivedAt:"2027-04-08",dueAt:"2027-04-22",amountCents:680000,paidCents:250000,stage:"freigegeben" },
            { id:"ER-2027-004",taskId:"estrich-neu",purchaseOrderId:"BE-2027-003",supplier:"Estrichbau Martin KG",invoiceNumber:"2027-0416",receivedAt:"2027-04-16",dueAt:"2027-04-30",amountCents:550000,paidCents:550000,stage:"freigegeben" },
        ],
    };
}
export const cloneFinance = (state: FinanceState): FinanceState => ({
    budgets:state.budgets.map((b)=>({...b})),
    orders:state.orders.map((o)=>({...o})),
    invoices:state.invoices.map((i)=>({...i})),
});

export function validMoney(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0;
}
export function financeTotals(state: FinanceState, taskId?: string): FinanceTotals {
    const scope = <T extends { taskId: string }>(rows: T[]) =>
        taskId ? rows.filter((row)=>row.taskId===taskId) : rows;
    const budgets = scope(state.budgets);
    const orders = scope(state.orders).filter((o)=>o.status!=="storniert");
    const invoices = scope(state.invoices);
    const budget = budgets.reduce((sum,b)=>sum+b.budgetCents,0);
    const ordered = orders.reduce((sum,o)=>sum+o.amountCents,0);
    const invoiced = invoices.reduce((sum,i)=>sum+i.amountCents,0);
    const paid = invoices.reduce((sum,i)=>sum+i.paidCents,0);
    const open = Math.max(0,invoiced-paid);
    // Invoice and order totals overlap. Use max per *position* instead of
    // summing both; prevents the same commitment being counted twice.
    const ids = new Set([...budgets.map(b=>b.taskId), ...orders.map(o=>o.taskId), ...invoices.map(i=>i.taskId)]);
    const exposure = [...ids].reduce((sum,id)=>{
        const orderValue = orders.filter(o=>o.taskId===id).reduce((n,o)=>n+o.amountCents,0);
        const invoiceValue = invoices.filter(i=>i.taskId===id).reduce((n,i)=>n+i.amountCents,0);
        return sum + Math.max(orderValue,invoiceValue);
    },0);
    return { budget, ordered, invoiced, paid, open, exposure, free:budget-exposure };
}
export function financeStatus(invoice: IncomingInvoice): "bezahlt"|"teilbezahlt"|"offen"|"pruefung" {
    if (invoice.paidCents >= invoice.amountCents) return "bezahlt";
    if (invoice.paidCents > 0) return "teilbezahlt";
    return invoice.stage==="pruefung"?"pruefung":"offen";
}
export function setBudget(state: FinanceState, taskId:string, value: Money): FinanceState {
    if (!validMoney(value)) throw new Error("Budget muss ein gültiger positiver Centbetrag sein.");
    const remaining=state.budgets.filter((b)=>b.taskId!==taskId);
    return {...state,budgets:[...remaining,{taskId,budgetCents:value}]};
}
export function addOrder(state:FinanceState, order:PurchaseOrder):FinanceState {
    if(!validMoney(order.amountCents)||!order.supplier.trim()||!order.description.trim())throw new Error("Bestellung unvollständig.");
    if(state.orders.some((o)=>o.id===order.id))throw new Error("Bestellnummer bereits vorhanden.");
    return {...state,orders:[...state.orders,order]};
}
export function addInvoice(state:FinanceState, invoice:IncomingInvoice):FinanceState {
    if(!validMoney(invoice.amountCents)||!validMoney(invoice.paidCents)||invoice.paidCents>invoice.amountCents)throw new Error("Rechnungsbeträge unplausibel.");
    if(!invoice.supplier.trim()||!invoice.invoiceNumber.trim())throw new Error("Lieferant und Rechnungsnummer erforderlich.");
    if(state.invoices.some((i)=>i.supplier.toLowerCase()===invoice.supplier.toLowerCase()&&i.invoiceNumber===invoice.invoiceNumber))throw new Error("Doppelte Eingangsrechnung.");
    return {...state,invoices:[...state.invoices,invoice]};
}
export const centsFromEuro = (value:string): number => {
    const cleaned=value.trim().replace(/\./g,"").replace(",",".");
    const amount=Number(cleaned);
    if(!Number.isFinite(amount)||amount<0||amount>100000000)return NaN;
    return Math.round(amount*100);
};