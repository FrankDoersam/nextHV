import { useMemo, useState } from "react";
import { de } from "date-fns/locale";
import { Plus, Wallet } from "lucide-react";
import { Gantt } from "@/components/reui/gantt/gantt";
import { GanttNav, GanttToolbar } from "@/components/reui/gantt/gantt-nav";
import { GanttView } from "@/components/reui/gantt/gantt-view";
import { Button } from "@/components/ui/button";
import {
    cloneFinance, financeTotals, initialFinance, setBudget, type FinanceState,
} from "./finance";
import { FinanceSheet } from "./finance-sheet";
import { TaskEditor } from "./task-editor";
import {
    DEFAULT_TASKS, PROJECT_START, ganttData, scheduleRenovation,
    type RenovationTask, type Trade,
} from "./plan";

const cloneTasks = () => DEFAULT_TASKS.map(task => ({...task,dependsOn:[...task.dependsOn]}));

/** Single Gantt workspace. Budget, purchasing and invoicing live in the Sheet. */
export function RenovationPlanner() {
    const [tasks,setTasks] = useState<RenovationTask[]>(cloneTasks);
    const [finance,setFinance] = useState<FinanceState>(()=>cloneFinance(initialFinance()));
    const [financeOpen,setFinanceOpen] = useState(false);
    const [activeTaskId,setActiveTaskId] = useState<string|null>(null);
    const [editingId,setEditingId] = useState<string|null>(null);

    const plan=useMemo(()=>scheduleRenovation(tasks,PROJECT_START),[tasks]);
    const {events,resources}=useMemo(()=>ganttData(plan),[plan]);
    const totals=useMemo(()=>financeTotals(finance),[finance]);
    const openFinance=(id:string|null)=>{
        setActiveTaskId(id);
        setFinanceOpen(true);
    };
    const save=(task:RenovationTask):string|undefined=>{
        const id=task.id==="__new__"
            ?"custom-"+String(tasks.reduce((max,item)=>Math.max(max,Number(item.id.replace("custom-",""))||0),0)+1)
            :task.id;
        const updated={...task,id};
        const next=tasks.some(t=>t.id===id)
            ?tasks.map(t=>t.id===id?updated:t)
            :[...tasks,updated];
        try{scheduleRenovation(next,PROJECT_START);}
        catch(err){return err instanceof Error?err.message:"Ungültige Abhängigkeiten.";}
        setTasks(next);
        if(task.id==="__new__")setFinance(prev=>setBudget(prev,id,0));
        setEditingId(null);
        setActiveTaskId(id);
        return undefined;
    };
    const remove=(id:string):string|undefined=>{
        if(tasks.some(t=>t.dependsOn.includes(id)))return "Der Vorgang ist noch Vorgänger anderer Aufgaben.";
        if(finance.orders.some(o=>o.taskId===id)||finance.invoices.some(i=>i.taskId===id))
            return "Die Position enthält Bestellungen oder Rechnungen und kann nicht gelöscht werden.";
        setTasks(previous=>previous.filter(t=>t.id!==id));
        setFinance(previous=>({...previous,budgets:previous.budgets.filter(b=>b.taskId!==id)}));
        setActiveTaskId(null);setFinanceOpen(false);setEditingId(null);
        return undefined;
    };
    const draft=editingId===null?null:editingId==="__new__"
        ?{id:"__new__",title:"",trade:"Vorbereitung" as Trade,duration:2,
            mode:"arbeitstage" as const,dependsOn:[],description:"",status:"geplant" as const,owner:""}
        :tasks.find(t=>t.id===editingId)??null;
    const openEditor=(id:string)=>{
        setFinanceOpen(false);setEditingId(id);
    };

    return <section data-slot="renovation-demo-page" className="min-h-0 min-w-0">
        <Gantt
            className="h-[calc(100dvh-6.5rem)] min-h-[720px] w-full overflow-hidden rounded-lg border bg-card"
            defaultDate={new Date(2027,2,1)}
            defaultScale="month"
            locale={de}
            events={events}
            resources={resources}
            treePanel={{width:330}}
            onEventClick={(occurrence)=>openFinance(String(occurrence.eventId).replace(/^task-/,""))}
            onResourceClick={({resource})=>{
                if(tasks.some(t=>t.id===resource.id))openFinance(resource.id);
            }}
        >
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b px-3">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                    <h1 className="hidden shrink-0 text-sm font-semibold xl:block">Kernsanierung Wohnung</h1>
                    <GanttNav className="min-w-0 flex-1 border-b-0" />
                </div>
                <GanttToolbar>
                    <Button size="sm" variant="outline"
                        aria-label="Budget, Bestellungen und Eingangsrechnungen öffnen"
                        onClick={()=>openFinance(null)}>
                        <Wallet className="size-4" aria-hidden="true" />
                        <span>Finanzen</span>
                    </Button>
                    <Button size="sm" onClick={()=>openEditor("__new__")}>
                        <Plus className="size-4" aria-hidden="true" />
                        <span>Vorgang</span>
                    </Button>
                </GanttToolbar>
            </div>
            <GanttView />
        </Gantt>
        <FinanceSheet
            open={financeOpen}
            onOpenChange={setFinanceOpen}
            taskId={activeTaskId}
            tasks={plan}
            state={finance}
            onChange={setFinance}
            onEditTask={openEditor}
        />
        {draft && <TaskEditor key={editingId} task={draft} allTasks={tasks}
            onCancel={()=>setEditingId(null)} onSave={save} onDelete={remove} />}
    </section>;
}