"use client";

import { useState } from "react";
import { de } from "date-fns/locale";
import { Plus, Wallet } from "lucide-react";
import { Gantt } from "@/components/reui/gantt/gantt";
import { GanttNav, GanttToolbar } from "@/components/reui/gantt/gantt-nav";
import type {
    GanttEvent, GanttProposedUpdate, GanttResource,
} from "@/components/reui/gantt/gantt-types";
import { GanttView } from "@/components/reui/gantt/gantt-view";
import { RenovationGanttSettingsMenu, RENOVATION_GANTT_DEFAULTS } from "./gantt-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface RenovationGanttWorkspaceProps {
    events: GanttEvent[];
    resources: GanttResource[];
    groupColors: Record<string, string>;
    onOpenFinances: (id: string | null) => void;
    onAddTask: () => void;
    onEditTask: (id: string) => void;
    onCanDrop: (update: GanttProposedUpdate) => boolean;
    onCommitEvent: (update: GanttProposedUpdate) => false | { start: Date; end: Date };
}

/**
 * ReUI c-gantt-1 composition. Uses the genuine upstream Gantt engine,
 * GanttNav, GanttToolbar and GanttView, plus its SettingsMenu Popover
 * structure. Layout, options and context interactions stay here, not
 * in the project controller.
 */
export function RenovationGanttWorkspace({
    events, resources, groupColors, onOpenFinances, onAddTask, onEditTask,
    onCanDrop, onCommitEvent,
}: RenovationGanttWorkspaceProps) {
    const [settings, setSettings] = useState({...RENOVATION_GANTT_DEFAULTS});
    const eventTaskId = (id: string) => id.replace(/^task-/, "");

    return <section data-slot="renovation-demo-page" className="min-h-0 min-w-0">
        <Card className="min-w-0 overflow-hidden py-0">
            <CardContent className="p-0">
                <Gantt
                    className="h-[calc(100dvh-6.5rem)] min-h-[720px] w-full"
                    defaultDate={new Date(2027, 2, 1)}
                    defaultScale="month"
                    locale={de}
                    timeZone="Europe/Berlin"
                    i18n={{
                        labels: {
                            today:"Heute",
                            addTask:"Vorgang anlegen",
                            scheduleHint:"Zeitraum planen",
                            scales:{day:"Tag",week:"Woche",month:"Monat",quarter:"Quartal",year:"Jahr"},
                        },
                    }}
                    events={events}
                    resources={resources}
                    scheduleMode="single"
                    treePanel={{width:350}}
                    rowCheckboxes={settings.rowCheckboxes}
                    summaryBars={settings.summaryBars}
                    zoomControl={settings.zoomControl}
                    offscreenIndicators={settings.offscreenIndicators}
                    infiniteScroll
                    nowIndicator={settings.nowIndicator}
                    offDays={settings.offDays}
                    dependencyLines={settings.dependencyLines}
                    barLabel={settings.barLabel}
                    timelineLines={settings.timelineLines}
                    displayCreateTaskHint={settings.displayCreateTaskHint}
                    interactions={{
                        drag:settings.drag, resize:settings.resize, selectSlot:false,
                    }}
                    onInteractionsChange={(next)=>setSettings((previous)=>({
                        ...previous,drag:next.drag,resize:next.resize,
                    }))}
                    onEventUpdate={onCommitEvent}
                    canDropEvent={onCanDrop}
                    enforceCanDrop
                    onEventClick={(occurrence)=>onOpenFinances(eventTaskId(String(occurrence.eventId)))}
                    onEventDoubleClick={(occurrence)=>onEditTask(eventTaskId(String(occurrence.eventId)))}
                    onResourceClick={({resource})=>{
                        if (!resource.id.startsWith("trade-")) onOpenFinances(resource.id);
                    }}
                    onResourceDoubleClick={({resource})=>{
                        if (!resource.id.startsWith("trade-")) onEditTask(resource.id);
                    }}
                    onCreateTask={onAddTask}
                    canCreateTask={()=>true}
                    renderResourceLabel={({resource,isGroup})=>isGroup
                        ? <span className="flex min-w-0 items-center gap-2">
                            <span className="size-2 shrink-0 rounded-full"
                                style={{backgroundColor:groupColors[resource.id] || "var(--color-slate-500)"}} />
                            <span className="truncate">{resource.title}</span>
                        </span>
                        : undefined}
                >
                    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b pe-3">
                        <h1 className="hidden shrink-0 ps-4 text-sm font-semibold xl:block">Kernsanierung Wohnung</h1>
                        <GanttNav className="min-w-0 flex-1 border-b-0" />
                        <GanttToolbar>
                            <RenovationGanttSettingsMenu value={settings} onChange={setSettings} />
                            <Button variant="outline" size="sm" onClick={()=>onOpenFinances(null)}
                                aria-label="Budget, Bestellungen und Eingangsrechnungen öffnen">
                                <Wallet className="size-4" aria-hidden="true" />
                                <span>Finanzen</span>
                            </Button>
                            <Button variant="default" size="sm" onClick={onAddTask}
                                aria-label="Vorgang anlegen">
                                <Plus className="size-4" aria-hidden="true" />
                                <span>Vorgang</span>
                            </Button>
                        </GanttToolbar>
                    </div>
                    <GanttView />
                </Gantt>
            </CardContent>
        </Card>
    </section>;
}
