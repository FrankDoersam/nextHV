"use client";

import { useState } from "react";
import { RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface RenovationGanttSettings {
    rowCheckboxes: boolean;
    summaryBars: boolean;
    zoomControl: boolean;
    offscreenIndicators: boolean;
    nowIndicator: boolean;
    offDays: boolean;
    dependencyLines: boolean;
    displayCreateTaskHint: boolean;
    drag: boolean;
    resize: boolean;
    barLabel: "inside" | "outside" | "auto";
    timelineLines: "vertical" | "both" | "none";
}

export const RENOVATION_GANTT_DEFAULTS: RenovationGanttSettings = {
    rowCheckboxes: false,
    summaryBars: true,
    zoomControl: true,
    offscreenIndicators: true,
    nowIndicator: false,
    offDays: true,
    dependencyLines: true,
    displayCreateTaskHint: true,
    drag: true,
    resize: true,
    barLabel: "inside",
    timelineLines: "vertical",
};

function SettingSwitch({
    id, label, checked, onCheckedChange,
}: {
    id: string;
    label: string;
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
}) {
    return <div className="flex items-center justify-between gap-4 py-1">
        <Label htmlFor={id} className="font-normal">{label}</Label>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>;
}
function SettingRadio({ id, value, label }: {
    id: string; value: string; label: string;
}) {
    return <div className="flex items-center gap-2 py-0.5">
        <RadioGroupItem id={id} value={value} aria-label={label} />
        <Label htmlFor={id} className="font-normal">{label}</Label>
    </div>;
}

/**
 * ReUI c-gantt-1 original SettingsMenu composition:
 * Popover → Tabs → Switch / RadioGroup, with a bottom reset action.
 * Keeps only controls genuinely supported by the renovation scheduler.
 */
export function RenovationGanttSettingsMenu({
    value, onChange,
}: {
    value: RenovationGanttSettings;
    onChange: (settings: RenovationGanttSettings) => void;
}) {
    const [open, setOpen] = useState(false);
    const update = <K extends keyof RenovationGanttSettings>(
        key: K, next: RenovationGanttSettings[K],
    ) => onChange({ ...value, [key]: next });
    return <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
            render={<Button variant="outline" size="sm" aria-label="Gantt Einstellungen">
                <Settings2 className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Einstellungen</span>
            </Button>}
        />
        <PopoverContent align="end" className="w-80 p-0">
            <Tabs defaultValue="display" className="gap-0">
                <div className="border-b p-2">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="display">Anzeige</TabsTrigger>
                        <TabsTrigger value="behavior">Verhalten</TabsTrigger>
                        <TabsTrigger value="style">Stil</TabsTrigger>
                    </TabsList>
                </div>
                <TabsContent value="display" className="space-y-0.5 p-3">
                    <SettingSwitch id="reno-show-checkboxes" label="Zeilen-Checkboxen" checked={value.rowCheckboxes} onCheckedChange={(v)=>update("rowCheckboxes",v)} />
                    <SettingSwitch id="reno-summary-bars" label="Gewerk-Zusammenfassung" checked={value.summaryBars} onCheckedChange={(v)=>update("summaryBars",v)} />
                    <SettingSwitch id="reno-zoom-control" label="Zoom-Steuerung" checked={value.zoomControl} onCheckedChange={(v)=>update("zoomControl",v)} />
                    <SettingSwitch id="reno-offscreen" label="Außerhalb liegende Vorgänge" checked={value.offscreenIndicators} onCheckedChange={(v)=>update("offscreenIndicators",v)} />
                    <SettingSwitch id="reno-now-line" label="Heute-Markierung" checked={value.nowIndicator} onCheckedChange={(v)=>update("nowIndicator",v)} />
                    <SettingSwitch id="reno-offdays" label="Wochenenden markieren" checked={value.offDays} onCheckedChange={(v)=>update("offDays",v)} />
                    <SettingSwitch id="reno-dependencies" label="Abhängigkeitspfeile" checked={value.dependencyLines} onCheckedChange={(v)=>update("dependencyLines",v)} />
                </TabsContent>
                <TabsContent value="behavior" className="space-y-0.5 p-3">
                    <SettingSwitch id="reno-drag" label="Balken verschieben" checked={value.drag} onCheckedChange={(v)=>update("drag",v)} />
                    <SettingSwitch id="reno-resize" label="Dauer per Ziehen ändern" checked={value.resize} onCheckedChange={(v)=>update("resize",v)} />
                    <SettingSwitch id="reno-create-hint" label="Vorgang am Tabellenende anlegen" checked={value.displayCreateTaskHint} onCheckedChange={(v)=>update("displayCreateTaskHint",v)} />
                    <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
                        Vorgänger, Arbeitstage und Freigabepunkte werden bei Änderungen geprüft.
                    </p>
                </TabsContent>
                <TabsContent value="style" className="space-y-4 p-3">
                    <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground">Balken-Beschriftung</div>
                        <RadioGroup value={value.barLabel} onValueChange={(v)=>update("barLabel",v as RenovationGanttSettings["barLabel"])}>
                            <SettingRadio id="reno-label-inside" value="inside" label="Innen" />
                            <SettingRadio id="reno-label-outside" value="outside" label="Außen" />
                            <SettingRadio id="reno-label-auto" value="auto" label="Automatisch" />
                        </RadioGroup>
                    </div>
                    <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground">Rasterlinien</div>
                        <RadioGroup value={value.timelineLines} onValueChange={(v)=>update("timelineLines",v as RenovationGanttSettings["timelineLines"])}>
                            <SettingRadio id="reno-lines-vertical" value="vertical" label="Vertikal" />
                            <SettingRadio id="reno-lines-both" value="both" label="Horizontal & vertikal" />
                            <SettingRadio id="reno-lines-none" value="none" label="Keine" />
                        </RadioGroup>
                    </div>
                </TabsContent>
            </Tabs>
            <div className="border-t p-2">
                <Button variant="outline" size="sm" className="w-full" onClick={()=>onChange({...RENOVATION_GANTT_DEFAULTS})}>
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Zurücksetzen
                </Button>
            </div>
        </PopoverContent>
    </Popover>;
}
