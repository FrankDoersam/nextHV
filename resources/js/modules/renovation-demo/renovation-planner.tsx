import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
    CalendarDays, ChevronDown, ClipboardCheck, HardHat, List, Pencil,
    Plus, RotateCcw, Search, Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/blocks/layout";
import { Badge } from "@/components/reui/badge";
import { Gantt } from "@/components/reui/gantt/gantt";
import { GanttNav, GanttToolbar } from "@/components/reui/gantt/gantt-nav";
import { GanttView } from "@/components/reui/gantt/gantt-view";
import { IconStack } from "@/components/reui/icon-stack";
import {
    Timeline, TimelineContent, TimelineDate, TimelineHeader,
    TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle,
} from "@/components/reui/timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TaskEditor } from "./task-editor";
import {
    DEFAULT_TASKS, PROJECT_START, TRADES, endOfProject, ganttData,
    humanDate, humanFinish, scheduleRenovation, type RenovationTask,
    type ScheduledTask, type Trade,
} from "./plan";

const initialTasks = () => DEFAULT_TASKS.map((task) => ({ ...task, dependsOn:[...task.dependsOn] }));
const statusNames = {
    geplant: "Geplant",
    beauftragt: "Beauftragt",
    erledigt: "Erledigt",
};
const statusBadge = {
    geplant: "secondary",
    beauftragt: "info-light",
    erledigt: "success-light",
} as const;
const milestoneIds = [
    "estrich-alt", "fenster-neu", "fussbodenheizung", "estrich-neu",
    "estrich-trocknung", "funktionsheizen", "belegreife", "abnahme",
];

function TradeMark({ trade }: { trade: Trade }) {
    return <span className="inline-flex items-center gap-2 text-sm">
        <span className="size-2.5 shrink-0 rounded-full" style={{backgroundColor:TRADES[trade].color}} />
        {TRADES[trade].label}
    </span>;
}

function DateRange({ task }: { task: ScheduledTask }) {
    return <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {humanDate(task.start)} – {humanFinish(task)}
    </span>;
}

export function RenovationPlanner() {
    const [tasks, setTasks] = useState<RenovationTask[]>(initialTasks);
    const [startISO, setStartISO] = useState(PROJECT_START);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [tradeFilter, setTradeFilter] = useState<Trade | "all">("all");
    const [search, setSearch] = useState("");
    const [error, setError] = useState("");
    const [detailsOpen, setDetailsOpen] = useState(false);

    const plan = useMemo(() => scheduleRenovation(tasks,startISO), [tasks,startISO]);
    const { events,resources } = useMemo(() => ganttData(plan.filter((task) =>
        tradeFilter === "all" || task.trade===tradeFilter)),[plan,tradeFilter]);
    const selected = plan.find((task) => task.id===selectedId);
    const visible = useMemo(() => plan.filter((task) =>
        (tradeFilter==="all" || task.trade===tradeFilter) &&
        (!search.trim() || [task.title,task.owner,task.description,TRADES[task.trade].label]
            .some((text) => text.toLocaleLowerCase("de-DE").includes(search.trim().toLocaleLowerCase("de-DE"))))
    ),[plan,tradeFilter,search]);
    const finish = endOfProject(plan);
    const finishedTasks = plan.filter((task) => task.status==="erledigt").length;
    const dry = plan.find((task) => task.id==="estrich-trocknung");
    const choose = (id: string) => {setSelectedId(id);setDetailsOpen(true);};
    const changeStart = (value: string) => {
        if (!value) return;
        try {
            scheduleRenovation(tasks,value);
            setStartISO(value);setError("");
        } catch (err) {setError(err instanceof Error?err.message:"Ungültiges Datum.");}
    };
    const save = (entry: RenovationTask): string | undefined => {
        const id = entry.id === "__new__"
            ? "custom-" + String(tasks.reduce((max,t) =>
                Math.max(max,Number(t.id.replace("custom-",""))||0),0)+1)
            : entry.id;
        const candidate = {...entry,id};
        const updated = tasks.some((t) => t.id===id)
            ? tasks.map((t) => t.id===id?candidate:t)
            : [...tasks,candidate];
        try {scheduleRenovation(updated,startISO);}
        catch(err) {return err instanceof Error?err.message:"Fehlerhafte Abhängigkeit.";}
        setTasks(updated);setEditingId(null);setSelectedId(id);setDetailsOpen(false);setError("");
        return undefined;
    };
    const remove = (id: string): string | undefined => {
        const next = tasks.filter((t) => t.id!==id);
        if (tasks.some((t) => t.dependsOn.includes(id))) {
            return "Der Vorgang ist noch Vorgänger anderer Aufgaben. Zuerst Abhängigkeiten entfernen.";
        }
        setTasks(next);setSelectedId(null);setEditingId(null);setDetailsOpen(false);return undefined;
    };
    const edit = (id: string) => {setDetailsOpen(false);setEditingId(id);};
    const draft = editingId===null?null:editingId==="__new__"
        ? {id:"__new__",title:"",trade:"Vorbereitung" as Trade,duration:2,
            mode:"arbeitstage" as const,dependsOn:[],description:"",status:"geplant" as const,owner:""}
        : tasks.find((task) => task.id===editingId) ?? null;

    return <section data-slot="renovation-demo-page" className="flex min-w-0 flex-col gap-5">
        <PageHeader
            title="Kernsanierung Wohnung"
            description="Projektplan ab März 2027 · Gewerke, Abhängigkeiten und ReUI-Gantt"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
                <IconStack className="hidden h-14 w-14 sm:block"><Wrench className="size-5" /></IconStack>
                <div className="min-w-0">
                    <p className="text-sm font-semibold">Wohnung · Kernsanierung</p>
                    <p className="text-xs text-muted-foreground">Beispielprojekt – keine echte Baustellendokumentation</p>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                    setTasks(initialTasks());setStartISO(PROJECT_START);setSelectedId(null);
                    setDetailsOpen(false);setTradeFilter("all");setSearch("");setError("");
                }}><RotateCcw className="size-4" /> Zurücksetzen</Button>
                <Button size="sm" onClick={() => setEditingId("__new__")}>
                    <Plus className="size-4" /> Vorgang anlegen
                </Button>
            </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
                ["Projektstart",humanDate(parseISO(startISO)),CalendarDays],
                ["Vorgänge",String(tasks.length),List],
                ["Prognose Übergabe",humanDate(addDays(finish,-1)),ClipboardCheck],
                ["Abgeschlossen",finishedTasks + " / " + tasks.length,HardHat],
            ].map(([label,value,Icon]) => {
                const Symbol = Icon as typeof List;
                return <Card key={label as string} size="sm" className="gap-1">
                    <CardContent className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">{label as string}</p>
                            <p className="text-lg font-semibold tabular-nums">{value as string}</p>
                        </div>
                        <Symbol className="size-5 text-muted-foreground" aria-hidden="true" />
                    </CardContent>
                </Card>;
            })}
        </div>
        <Alert className="border-warning/30 bg-warning/5">
            <ClipboardCheck className="text-warning" aria-hidden="true" />
            <AlertTitle>Estrich-Belegreife ist ein Freigabepunkt</AlertTitle>
            <AlertDescription>
                21 Kalendertage Liege-/Trocknungszeit sind nur eine Annahme.
                Funktionsheizen, ggf. Belegreifheizen und CM-Messung sind getrennt eingeplant.
                Bodenbeläge beginnen erst nach fachlicher Freigabe.
            </AlertDescription>
        </Alert>
        <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
                <label htmlFor="reno-start" className="text-xs font-medium text-muted-foreground">Startdatum</label>
                <Input id="reno-start" type="date" value={startISO} className="w-44" onChange={(event) => changeStart(event.target.value)} />
            </div>
            <div className="space-y-1">
                <label htmlFor="reno-trade-filter" className="text-xs font-medium text-muted-foreground">Gewerk</label>
                <Select value={tradeFilter} onValueChange={(value) => value && setTradeFilter(value as Trade|"all")}>
                    <SelectTrigger id="reno-trade-filter" className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Alle Gewerke</SelectItem>
                        {(Object.keys(TRADES) as Trade[]).map((trade) =>
                            <SelectItem key={trade} value={trade}>{TRADES[trade].label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <Input aria-label="Vorgänge suchen" placeholder="Vorgänge suchen …" className="h-9 border-0 bg-transparent px-0 shadow-none" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
        </div>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(Object.keys(TRADES) as Trade[]).map((trade) =>
                <button key={trade} type="button" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-pressed={tradeFilter===trade}
                    onClick={() => setTradeFilter(tradeFilter===trade?"all":trade)}>
                    <TradeMark trade={trade} />
                </button>)}
        </div>
        <Tabs defaultValue="gantt" className="min-w-0 gap-4">
            <TabsList variant="line" className="w-full justify-start border-b">
                <TabsTrigger value="gantt">Gantt <Badge variant="info-light" size="sm">{plan.length}</Badge></TabsTrigger>
                <TabsTrigger value="vorgaenge">Vorgänge</TabsTrigger>
                <TabsTrigger value="meilensteine">Meilensteine</TabsTrigger>
            </TabsList>
            <TabsContent value="gantt" className="min-w-0">
                <Card className="min-w-0 overflow-hidden py-0">
                    <CardContent className="p-0">
                        <Gantt
                            key={startISO}
                            className="h-[650px] w-full"
                            events={events}
                            resources={resources}
                            defaultScale="week"
                            defaultDate={parseISO(startISO)}
                            locale={de}
                            treePanel={{width:340}}
                            onEventClick={(occurrence) => choose(String(occurrence.eventId).replace(/^task-/,""))}
                            onResourceClick={({resource}) => {
                                if (tasks.some((task) => task.id===resource.id)) choose(resource.id);
                            }}
                        >
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b px-2">
                                <GanttNav className="min-w-0 flex-1 border-b-0" />
                                <GanttToolbar><Button size="sm" variant="outline" onClick={() => setEditingId("__new__")}>
                                    <Plus className="size-4" /> Vorgang
                                </Button></GanttToolbar>
                            </div>
                            <GanttView />
                        </Gantt>
                    </CardContent>
                </Card>
                <p className="mt-2 text-xs text-muted-foreground">
                    ReUI-Gantt mit abhängigen Vorgängen und farbigen Gewerken. Balken sind wegen der
                    Abhängigkeitslogik nicht direkt verschiebbar; Bearbeitung über Vorgang/Details.
                </p>
            </TabsContent>
            <TabsContent value="vorgaenge">
                <Card className="min-w-0 py-0"><CardContent className="overflow-x-auto p-0">
                    {visible.length > 0 ? <Table className="min-w-[740px]">
                        <TableHeader><TableRow>
                            <TableHead>Vorgang</TableHead><TableHead>Gewerk</TableHead>
                            <TableHead>Start – Ende</TableHead><TableHead>Dauer</TableHead>
                            <TableHead>Status</TableHead><TableHead />
                        </TableRow></TableHeader>
                        <TableBody>{visible.map((task) =>
                            <TableRow key={task.id}>
                                <TableCell className="max-w-60 truncate font-medium">{task.title}</TableCell>
                                <TableCell><TradeMark trade={task.trade} /></TableCell>
                                <TableCell><DateRange task={task} /></TableCell>
                                <TableCell className="whitespace-nowrap">{task.duration} {task.mode==="kalendertage"?"Kal.-Tage":"AT"}</TableCell>
                                <TableCell><Badge variant={statusBadge[task.status]}>{statusNames[task.status]}</Badge></TableCell>
                                <TableCell><Button size="sm" variant="ghost" onClick={() => choose(task.id)}>Details</Button></TableCell>
                            </TableRow>)}</TableBody>
                    </Table> : <Empty className="m-4">
                        <EmptyHeader><EmptyTitle>Keine Vorgänge gefunden</EmptyTitle>
                        <EmptyDescription>Suchbegriff oder Gewerkfilter anpassen.</EmptyDescription></EmptyHeader>
                    </Empty>}
                </CardContent></Card>
            </TabsContent>
            <TabsContent value="meilensteine">
                <Card className="py-0"><CardContent className="p-5">
                    <Timeline value={0} className="max-w-3xl">
                        {plan.filter((task) => milestoneIds.includes(task.id)).map((task,index) => (
                            <TimelineItem key={task.id} step={index+1}>
                                <TimelineIndicator style={{borderColor:TRADES[task.trade].color}} />
                                <TimelineSeparator />
                                <TimelineHeader><TimelineDate>{humanDate(task.start)}</TimelineDate></TimelineHeader>
                                <TimelineTitle>{task.title}</TimelineTitle>
                                <TimelineContent>
                                    <p>{task.description}</p>
                                    <Button variant="ghost" size="sm" className="mt-1" onClick={() => choose(task.id)}>Details ansehen</Button>
                                </TimelineContent>
                            </TimelineItem>
                        ))}
                    </Timeline>
                </CardContent></Card>
            </TabsContent>
        </Tabs>
        <Collapsible className="rounded-lg border p-3">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium">
                Planannahmen und Grenzen <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>Der Terminplan ist eine illustrative Reihenfolge. Arbeitstage überspringen Wochenenden, berücksichtigen aber keine Feiertage, Ferien, Genehmigungen oder Lieferengpässe.</p>
                <p>Brandschutz, Statik, Schallschutz, Schadstoffprüfung, Fensterbestellung, Prüfprotokolle und tatsächlich notwendige Estrichtrocknung sind mit Fachbetrieben zu klären.</p>
                <p>Veränderungen sind nur im Browser gespeichert und gehen beim Neuladen verloren.</p>
            </CollapsibleContent>
        </Collapsible>
        <Sheet open={detailsOpen && !!selected} onOpenChange={(open) => {if(!open)setDetailsOpen(false);}}>
            <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
                {selected && <>
                    <SheetHeader>
                        <SheetTitle>{selected.title}</SheetTitle>
                        <SheetDescription>Gewerk: {TRADES[selected.trade].label}</SheetDescription>
                    </SheetHeader>
                    <div className="space-y-5 px-4">
                        <div className="flex flex-wrap gap-2">
                            <Badge variant={statusBadge[selected.status]}>{statusNames[selected.status]}</Badge>
                            <Badge variant="outline">{selected.duration} {selected.mode==="kalendertage"?"Kalendertage":"Arbeitstage"}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                            <Avatar className="size-9"><AvatarFallback>{TRADES[selected.trade].label.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                            <span className="text-sm">{selected.owner||TRADES[selected.trade].label}</span>
                        </div>
                        <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
                            <div><dt className="text-muted-foreground">Beginn</dt><dd className="mt-1 font-medium">{humanDate(selected.start)}</dd></div>
                            <div><dt className="text-muted-foreground">Ende</dt><dd className="mt-1 font-medium">{humanFinish(selected)}</dd></div>
                        </dl>
                        <div className="space-y-1">
                            <p className="text-sm font-semibold">Leistungsbeschreibung</p>
                            <p className="text-sm text-muted-foreground">{selected.description}</p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-semibold">Abhängigkeiten</p>
                            {selected.dependsOn.length ? selected.dependsOn.map((dep) =>
                                <p key={dep} className="rounded-lg border px-3 py-2 text-sm">
                                    {tasks.find((task) => task.id===dep)?.title??dep}
                                </p>) : <p className="text-sm text-muted-foreground">Keine Vorgänger</p>}
                        </div>
                    </div>
                    <SheetFooter>
                        <Button onClick={() => edit(selected.id)}><Pencil className="size-4" /> Vorgang bearbeiten</Button>
                    </SheetFooter>
                </>}
            </SheetContent>
        </Sheet>
        {draft && <TaskEditor key={editingId} task={draft} allTasks={tasks}
            onCancel={() => setEditingId(null)} onSave={save} onDelete={remove} />}
    </section>;
}
