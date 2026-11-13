import { useState } from "react";
import {
    ArrowRight,
    BarChart3,
    CalendarDays,
    Check,
    SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PeopleGroup, type AvatarPerson } from "./people-avatar";
import { WorkspaceCard } from "./workspace-card";
import { BarChart, type BarDatum } from "./bar-chart";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DashboardControls({
    period,
    onPeriod,
    widgets,
    onWidget,
}: {
    period: string;
    onPeriod: (value: string) => void;
    widgets: Record<string, boolean>;
    onWidget: (key: string, value: boolean) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2">
            <Select value={period} onValueChange={(v) => onPeriod(String(v))}>
                <SelectTrigger aria-label="Vorschau-Zeitraum">
                    <CalendarDays />
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="month">Dieser Monat</SelectItem>
                    <SelectItem value="quarter">Dieses Quartal</SelectItem>
                </SelectContent>
            </Select>
            <Popover>
                <PopoverTrigger render={<Button variant="outline" />}>
                    <SlidersHorizontal /> Anpassen
                </PopoverTrigger>
                <PopoverContent align="end" className="w-60">
                    <p className="mb-3 text-sm font-medium">
                        Vorschau-Bausteine
                    </p>
                    {Object.entries(widgets).map(([key, checked]) => (
                        <label
                            key={key}
                            className="flex items-center gap-2 py-2 text-sm"
                        >
                            <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                    onWidget(key, v === true)
                                }
                            />
                            {key}
                        </label>
                    ))}
                </PopoverContent>
            </Popover>
        </div>
    );
}
export function PreviewNotice() {
    return (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded border bg-muted px-1.5 py-0.5 font-medium">
                Designvorschau
            </span>
            Finanzen, Termine und Aufgaben zeigen Beispieldaten. Echte
            Bestandsdaten findest du im Tab „Bestand“.
        </p>
    );
}
export function RevenueCard({
    bars,
    period,
    onOpen,
}: {
    bars: BarDatum[];
    period: string;
    onOpen: () => void;
}) {
    const [view, setView] = useState<"rent" | "income">("rent");
    const values = bars.map((d) => ({
        ...d,
        value: view === "rent" ? d.value : Math.round(d.value * 0.94),
    }));
    const amount =
        period === "month"
            ? values.at(-1)!.value
            : values.slice(-3).reduce((sum, d) => sum + d.value, 0);
    return (
        <WorkspaceCard
            title="Finanzen · Monatsübersicht"
            icon={<BarChart3 />}
            footer={
                <>
                    <span className="font-mono uppercase tracking-wide">
                        Beispieldaten · noch ohne Zahlungsanbindung
                    </span>
                    <Button variant="ghost" size="sm" onClick={onOpen}>
                        Verträge <ArrowRight />
                    </Button>
                </>
            }
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                        Miete, Zahlungseingänge und Entwicklung an einem Ort.
                        Die Vorschau zeigt den geplanten Aufbau.
                    </p>
                    <p className="mt-4 text-4xl font-medium tracking-tight tabular-nums">
                        {money(amount)}
                    </p>
                    <p className="mt-2 text-xs text-success">
                        ↗ 8,4 %{" "}
                        <span className="text-muted-foreground">
                            zum Vergleichszeitraum · Beispiel
                        </span>
                    </p>
                </div>
                <div className="flex rounded-lg border bg-muted/60 p-0.5">
                    {(
                        [
                            ["rent", "Miete"],
                            ["income", "Eingänge"],
                        ] as const
                    ).map(([key, label]) => (
                        <Button
                            key={key}
                            size="sm"
                            variant="ghost"
                            aria-pressed={view === key}
                            onClick={() => setView(key)}
                            className={cn(
                                "h-7 text-xs",
                                view === key && "bg-card shadow-xs",
                            )}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
            </div>
            <BarChart
                label="Beispielhafter monatlicher Mietverlauf"
                data={values}
                formatValue={(v) => money(Math.round(v))}
                goal={56000}
            />
        </WorkspaceCard>
    );
}
export interface AgendaEntry {
    time: string;
    title: string;
    description: string;
    people: AvatarPerson[];
}
export function AgendaCard({
    entries,
    onOpen,
}: {
    entries: AgendaEntry[];
    onOpen: () => void;
}) {
    const [tasks, setTasks] = useState([false, false, true]);
    const labels = [
        "Übergabeprotokoll vorbereiten",
        "Handwerkertermin abstimmen",
        "Vertragsunterlagen prüfen",
    ];
    return (
        <WorkspaceCard
            title="Heute · Dein Tagesplan"
            icon={<CalendarDays />}
            footer={
                <>
                    <span className="font-mono uppercase tracking-wide">
                        Termine & Aufgaben · Vorschau
                    </span>
                    <Button variant="ghost" size="sm" onClick={onOpen}>
                        Objekte <ArrowRight />
                    </Button>
                </>
            }
        >
            <p className="mb-3 text-xs leading-5">
                So könnte dein Tag aussehen: drei Termine und die wichtigsten
                nächsten Schritte.
            </p>
            <div className="divide-y border-y">
                {entries.map((entry) => (
                    <div
                        key={entry.time}
                        className="flex items-center gap-3 py-4"
                    >
                        <time className="w-9 shrink-0 text-xs text-muted-foreground">
                            {entry.time}
                        </time>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium">{entry.title}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                {entry.description}
                            </p>
                        </div>
                        <PeopleGroup people={entry.people} max={3} />
                    </div>
                ))}
            </div>
            <div className="mt-3 space-y-3">
                {labels.map((label, i) => (
                    <label
                        key={label}
                        className="flex cursor-pointer items-center gap-2 text-xs"
                    >
                        <Checkbox
                            checked={tasks[i]}
                            onCheckedChange={(checked) =>
                                setTasks((t) =>
                                    t.map((v, index) =>
                                        index === i ? checked === true : v,
                                    ),
                                )
                            }
                        />
                        <span
                            className={cn(
                                tasks[i] &&
                                    "text-muted-foreground line-through",
                            )}
                        >
                            {label}
                        </span>
                        {i === 1 && !tasks[i] && (
                            <span className="ml-auto rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                                Heute
                            </span>
                        )}
                        {tasks[i] && (
                            <Check className="ml-auto size-3 text-muted-foreground" />
                        )}
                    </label>
                ))}
            </div>
        </WorkspaceCard>
    );
}
export function DashboardMetric({
    title,
    value,
    change,
    footer,
    bars,
    formatValue,
}: {
    title: string;
    value: string;
    change: string;
    footer: string;
    bars: BarDatum[];
    formatValue?: (value: number) => string;
}) {
    return (
        <WorkspaceCard
            title={title}
            compact
            footer={
                <span className="font-mono uppercase tracking-wide">
                    {footer}
                </span>
            }
        >
            <p className="text-3xl font-medium tracking-tight tabular-nums">
                {value}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{change}</p>
            <BarChart
                data={bars}
                label={`${title} · Beispieldaten`}
                compact
                formatValue={formatValue}
            />
        </WorkspaceCard>
    );
}
