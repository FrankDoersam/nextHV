import { useMemo, useState } from "react";
import type { GanttProposedUpdate } from "@/components/reui/gantt/gantt-types";
import { RenovationGanttWorkspace } from "@/components/reui/renovation/gantt-workspace";
import { TaskEditor } from "@/components/reui/renovation/task-sheet";
import { FinanceSheet } from "@/components/reui/renovation/finance-sheet";
import {
    cloneFinance, initialFinance, setBudget, type FinanceState,
} from "@/lib/renovation/finance";
import {
    DEFAULT_TASKS, PROJECT_START, TRADES, ganttData, scheduleRenovation,
    type RenovationTask, type Trade,
} from "@/lib/renovation/plan";
import { applyGanttProposal } from "./gantt-interactions";

const cloneTasks = () => DEFAULT_TASKS.map(task => ({
    ...task, dependsOn: [...task.dependsOn],
}));
const groupColors = Object.fromEntries(
    Object.entries(TRADES).map(([trade, info]) => ["trade-" + trade, info.color]),
);

/**
 * Domain controller only: tasks, dependency graph and finance records.
 * Gantt, Settings Popover, Task Sheet and Finance Sheet all live
 * in resources/js/components/reui/renovation/.
 */
export function RenovationPlanner() {
    const [tasks, setTasks] = useState<RenovationTask[]>(cloneTasks);
    const [finance, setFinance] = useState<FinanceState>(() => cloneFinance(initialFinance()));
    const [financeOpen, setFinanceOpen] = useState(false);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    const plan = useMemo(() => scheduleRenovation(tasks, PROJECT_START), [tasks]);
    const {events, resources} = useMemo(() => ganttData(plan), [plan]);

    const openFinance = (id: string | null) => {
        setActiveTaskId(id);
        setFinanceOpen(true);
    };
    const edit = (id: string) => {
        setFinanceOpen(false);
        setEditingId(id);
    };
    const commitGanttChange = (proposal: GanttProposedUpdate) => {
        const result = applyGanttProposal(tasks, proposal);
        if (!result) return false as const;
        setTasks(result.tasks);
        return { start: result.scheduled.start, end: result.scheduled.endExclusive };
    };
    const canDropEvent = (proposal: GanttProposedUpdate) =>
        applyGanttProposal(tasks, proposal) !== null;

    const save = (task: RenovationTask): string | undefined => {
        const id = task.id === "__new__"
            ? "custom-" + String(tasks.reduce((max, entry) =>
                Math.max(max, Number(entry.id.replace("custom-", "")) || 0), 0) + 1)
            : task.id;
        const updated = {...task, id};
        const next = tasks.some(entry => entry.id === id)
            ? tasks.map(entry => entry.id === id ? updated : entry)
            : [...tasks, updated];
        try { scheduleRenovation(next, PROJECT_START); }
        catch(err) { return err instanceof Error ? err.message : "Ungültige Abhängigkeiten."; }
        setTasks(next);
        if (task.id === "__new__") setFinance(prev => setBudget(prev, id, 0));
        setEditingId(null);
        setActiveTaskId(id);
        return undefined;
    };
    const remove = (id: string): string | undefined => {
        if (tasks.some(entry => entry.dependsOn.includes(id)))
            return "Der Vorgang ist noch Vorgänger anderer Aufgaben.";
        if (finance.orders.some(order => order.taskId === id) ||
            finance.invoices.some(invoice => invoice.taskId === id))
            return "Die Position enthält Bestellungen oder Rechnungen und kann nicht gelöscht werden.";
        setTasks(previous => previous.filter(entry => entry.id !== id));
        setFinance(previous => ({
            ...previous, budgets: previous.budgets.filter(b => b.taskId !== id),
        }));
        setActiveTaskId(null);
        setFinanceOpen(false);
        setEditingId(null);
        return undefined;
    };
    const draft = editingId === null ? null : editingId === "__new__"
        ? {
            id:"__new__", title:"", trade:"Vorbereitung" as Trade,
            duration:2, mode:"arbeitstage" as const, dependsOn:[],
            description:"", status:"geplant" as const, owner:"",
        }
        : tasks.find(task => task.id === editingId) ?? null;

    return <>
        <RenovationGanttWorkspace
            events={events}
            resources={resources}
            groupColors={groupColors}
            onOpenFinances={openFinance}
            onAddTask={() => edit("__new__")}
            onEditTask={edit}
            onCanDrop={canDropEvent}
            onCommitEvent={commitGanttChange}
        />
        <FinanceSheet
            open={financeOpen}
            onOpenChange={setFinanceOpen}
            taskId={activeTaskId}
            tasks={plan}
            state={finance}
            onChange={setFinance}
            onEditTask={edit}
        />
        {draft && <TaskEditor
            key={editingId}
            task={draft}
            allTasks={tasks}
            onCancel={()=>setEditingId(null)}
            onSave={save}
            onDelete={remove}
        />}
    </>;
}
