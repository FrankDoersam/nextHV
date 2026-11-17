import { addDays, format, isWeekend, parseISO } from "date-fns";
import type { GanttEvent, GanttResource } from "@/components/reui/gantt/gantt-types";

/** Local, fictional apartment renovation. No real tenant / construction records. */
export const PROJECT_START = "2027-03-01";
export const TRADES = {
    Vorbereitung: { label: "Vorbereitung", color: "var(--color-slate-500)" },
    Rückbau: { label: "Rückbau", color: "var(--color-rose-500)" },
    Fensterbau: { label: "Fensterbau", color: "var(--color-sky-500)" },
    Elektro: { label: "Elektro", color: "var(--color-amber-500)" },
    Sanitär: { label: "Sanitär / Heizung", color: "var(--color-cyan-500)" },
    Estrich: { label: "Dämmung / Estrich", color: "var(--color-violet-500)" },
    Ausbau: { label: "Innenausbau", color: "var(--color-emerald-500)" },
    Abschluss: { label: "Abschluss", color: "var(--color-indigo-500)" },
} as const;

export type Trade = keyof typeof TRADES;
export type TaskStatus = "geplant" | "beauftragt" | "erledigt";
export type DayMode = "arbeitstage" | "kalendertage";

export interface RenovationTask {
    id: string;
    title: string;
    trade: Trade;
    duration: number;
    mode: DayMode;
    dependsOn: string[];
    description: string;
    status: TaskStatus;
    owner: string;
    /** Earliest user-requested date; dependencies still take precedence. */
    notBefore?: string;
}

export interface ScheduledTask extends RenovationTask {
    start: Date;
    endExclusive: Date;
}

type Seed = Omit<RenovationTask, "mode" | "status" | "owner"> &
    Partial<Pick<RenovationTask, "mode" | "status" | "owner">>;

const entries: Seed[] = [
    { id:"einrichten", title:"Baustelle einrichten & schützen", trade:"Vorbereitung", duration:1, dependsOn:[], description:"Staubschutz, Laufwege, Entsorgung und Strom-/Wasserabschaltung koordinieren." },
    { id:"tapeten", title:"Tapeten entfernen", trade:"Rückbau", duration:2, dependsOn:["einrichten"], description:"Alte Tapeten von Wänden und Decken vollständig ablösen; Untergrund beurteilen." },
    { id:"boden-alt", title:"Alte Bodenbeläge entfernen", trade:"Rückbau", duration:2, dependsOn:["tapeten"], description:"Beläge, Sockelleisten und Kleberreste fachgerecht entfernen." },
    { id:"estrich-alt", title:"Bestehenden Estrich ausbauen", trade:"Rückbau", duration:3, dependsOn:["boden-alt"], description:"Vorab Schadstoffe, Statik und Leitungen prüfen; Estrich kontrolliert ausbauen." },
    { id:"entsorgung", title:"Schuttentsorgung & Rohboden prüfen", trade:"Rückbau", duration:1, dependsOn:["estrich-alt"], description:"Abbruchmaterial entsorgen, Rohboden und Aufbauhöhen vermessen." },
    { id:"fenster-aufmass", title:"Fenster aufmessen und bestellen", trade:"Fensterbau", duration:1, dependsOn:["einrichten"], description:"Fenstermaße, Anschlüsse und energetische Anforderungen festlegen." },
    { id:"fenster-lieferung", title:"Fenster-Lieferzeit (Annahme)", trade:"Fensterbau", duration:20, mode:"kalendertage", dependsOn:["fenster-aufmass"], description:"Nur fiktiver Lieferpuffer. Tatsächlichen Liefertermin vom Fensterbauer bestätigen lassen." },
    { id:"fenster-neu", title:"Neue Fenster montieren", trade:"Fensterbau", duration:2, dependsOn:["entsorgung","fenster-lieferung"], description:"Montage und luftdichte Anschlüsse mit Fachfirma; Wetterschutz sicherstellen." },
    { id:"fensterbaenke", title:"Neue Fensterbänke setzen", trade:"Fensterbau", duration:1, dependsOn:["fenster-neu"], description:"Innenfensterbänke einpassen, Fugen und Laibungen sauber ausbilden." },
    { id:"elektro-roh", title:"Elektro-Rohinstallation", trade:"Elektro", duration:4, dependsOn:["entsorgung"], description:"Schlitze, Leitungen und Unterputzdosen durch Elektrofachbetrieb." },
    { id:"sanitaer-roh", title:"Sanitär-/Heizungs-Rohinstallation", trade:"Sanitär", duration:4, dependsOn:["entsorgung"], description:"Leitungsführung, Heizkreisverteilerposition und Anschlüsse vorbereiten." },
    { id:"untergrund", title:"Rohboden vorbereiten", trade:"Estrich", duration:1, dependsOn:["entsorgung"], description:"Ebenheit, Abdichtung, Aufbauhöhe und Randanschlüsse prüfen." },
    { id:"daemmung", title:"Trittschall- und Wärmedämmung", trade:"Estrich", duration:2, dependsOn:["untergrund","fenster-neu","elektro-roh","sanitaer-roh"], description:"Dämmplatten, Randdämmstreifen und Systemaufbau nach Planung verlegen." },
    { id:"fussbodenheizung", title:"Fußbodenheizung + Verteiler", trade:"Sanitär", duration:2, dependsOn:["daemmung"], description:"Heizrohre, Verteiler und Kreise montieren (2 Arbeitstage als Planannahme)." },
    { id:"druckprobe", title:"Druckprüfung und Dokumentation", trade:"Sanitär", duration:1, dependsOn:["fussbodenheizung"], description:"Heizkreise spülen, prüfen, protokollieren; Freigabe vor Estrich." },
    { id:"estrich-neu", title:"Neuen Estrich einbauen", trade:"Estrich", duration:2, dependsOn:["druckprobe"], description:"Estrich passend zum Heizsystem mit Fugenplanung einbauen." },
    { id:"estrich-trocknung", title:"Estrich: 21 Tage Liege-/Trocknungszeit", trade:"Estrich", duration:21, mode:"kalendertage", dependsOn:["estrich-neu"], description:"Planannahme für Zementestrich. 21 Tage sind KEINE automatische Belegreife; Vorgaben von System/Hersteller gelten." },
    { id:"waende", title:"Wände und Laibungen spachteln", trade:"Ausbau", duration:4, dependsOn:["fensterbaenke","elektro-roh"], description:"Untergründe vorbereiten und Flächen für Anstrich herstellen." },
    { id:"funktionsheizen", title:"Funktionsheizen (Protokoll)", trade:"Sanitär", duration:7, mode:"kalendertage", dependsOn:["estrich-trocknung"], description:"Heizprotokoll gemäß System-/Herstellervorgaben. Dient der Funktionsprüfung, nicht allein der Belegreife." },
    { id:"belegreife", title:"CM-Messung / Belegreife freigeben", trade:"Estrich", duration:1, dependsOn:["funktionsheizen"], description:"Restfeuchte fachgerecht messen und protokollieren; bei Bedarf zusätzliche Trocknungs-/Belegreifheizphase." },
    { id:"fliesen", title:"Fliesen verlegen", trade:"Ausbau", duration:4, dependsOn:["belegreife"], description:"Boden-/Nassbereichsfliesen und Abdichtung nach Fachplanung." },
    { id:"boden-neu", title:"Neue Bodenbeläge verlegen", trade:"Ausbau", duration:4, dependsOn:["belegreife"], description:"Oberboden erst nach nachgewiesener Belegreife; Sockelleisten ergänzen." },
    { id:"maler", title:"Grundieren und Malerarbeiten", trade:"Ausbau", duration:3, dependsOn:["waende","estrich-trocknung"], description:"Wände, Decken und Laibungen grundieren und streichen." },
    { id:"sanitaer-end", title:"Sanitär-Endmontage", trade:"Sanitär", duration:2, dependsOn:["fliesen"], description:"Sanitärobjekte, Armaturen und Anlageneinstellungen fertigstellen." },
    { id:"elektro-end", title:"Elektro-Endmontage", trade:"Elektro", duration:2, dependsOn:["maler"], description:"Schalter, Steckdosen, Leuchtenanschlüsse und Prüfprotokoll." },
    { id:"tueren", title:"Innentüren & Sockelleisten", trade:"Ausbau", duration:2, dependsOn:["boden-neu"], description:"Zargen, Türblätter und Abschlussleisten montieren." },
    { id:"abnahme", title:"Endreinigung, Prüfung & Übergabe", trade:"Abschluss", duration:2, dependsOn:["tueren","elektro-end","sanitaer-end"], description:"Funktionsprüfung, Abnahmeprotokoll und Restpunkte dokumentieren." },
];

export const DEFAULT_TASKS: RenovationTask[] = entries.map((task) => ({
    ...task, mode:task.mode ?? "arbeitstage", status:task.status ?? "geplant",
    owner:task.owner ?? TRADES[task.trade].label,
}));

function assertDay(value: string): Date {
    const d = parseISO(value);
    if (Number.isNaN(d.getTime()) || format(d,"yyyy-MM-dd") !== value) {
        throw new Error("Ungültiges Projektstartdatum.");
    }
    return d;
}
function atWorkday(day: Date): Date {
    let d = day;
    while (isWeekend(d)) d = addDays(d,1);
    return d;
}
function workdayEndExclusive(start: Date, duration: number): Date {
    let date = start;
    let used = 0;
    while (used < duration) {
        if (!isWeekend(date)) used++;
        date = addDays(date,1);
    }
    return date;
}
const later = (a: Date, b: Date): Date => a.getTime() >= b.getTime() ? a : b;

/** DAG topological scheduler: finish-to-start, weekends skipped for trades. */
export function scheduleRenovation(
    tasks: RenovationTask[],
    startISO = PROJECT_START,
): ScheduledTask[] {
    const origin = assertDay(startISO);
    const byId = new Map(tasks.map((task) => [task.id,task]));
    if (byId.size !== tasks.length) throw new Error("Doppelte Vorgangs-ID.");
    const visited = new Map<string, ScheduledTask>();
    const visiting = new Set<string>();

    const resolve = (id: string): ScheduledTask => {
        const cached = visited.get(id);
        if (cached) return cached;
        if (visiting.has(id)) throw new Error("Zyklische Abhängigkeit: " + id);
        const task = byId.get(id);
        if (!task) throw new Error("Unbekannte Abhängigkeit: " + id);
        if (!Number.isInteger(task.duration) || task.duration < 1 || task.duration > 365) {
            throw new Error("Dauer muss zwischen 1 und 365 Tagen liegen.");
        }
        visiting.add(id);
        let earliest = origin;
        for (const dependency of task.dependsOn) {
            if (dependency === id) throw new Error("Vorgang darf nicht sich selbst voraussetzen.");
            earliest = later(earliest,resolve(dependency).endExclusive);
        }
        if (task.notBefore) earliest = later(earliest,assertDay(task.notBefore));
        const start = task.mode === "arbeitstage" ? atWorkday(earliest) : earliest;
        const endExclusive = task.mode === "kalendertage"
            ? addDays(start,task.duration)
            : workdayEndExclusive(start,task.duration);
        const ready = { ...task, start, endExclusive };
        visited.set(id,ready);
        visiting.delete(id);
        return ready;
    };
    return tasks.map((task) => resolve(task.id));
}

export function endOfProject(plan: ScheduledTask[]): Date {
    if (!plan.length) return assertDay(PROJECT_START);
    return plan.reduce((latest, task) => later(latest,task.endExclusive),plan[0].endExclusive);
}

export function ganttData(plan: ScheduledTask[]): {
    events: GanttEvent[];
    resources: GanttResource[];
} {
    const resources: GanttResource[] = [];
    const events: GanttEvent[] = [];
    for (const trade of Object.keys(TRADES) as Trade[]) {
        const group = plan.filter((task) => task.trade === trade);
        if (!group.length) continue;
        resources.push({
            id: "trade-" + trade,
            title:TRADES[trade].label,
            children:group.map((task) => ({id:task.id,title:task.title})),
        });
        for (const task of group) {
            events.push({
                id:"task-" + task.id, title:task.title,
                start:task.start, end:task.endExclusive, allDay:true,
                resourceId:task.id,
                dependencies:task.dependsOn.map((id) => "task-" + id),
                color:TRADES[task.trade].color,
                progress:task.status==="erledigt"?100:task.status==="beauftragt"?20:0,
                // Moisture and heating acceptance gates require explicit edit approval.
                readOnly:["estrich-trocknung","funktionsheizen","belegreife"].includes(task.id),
            });
        }
    }
    return { events,resources };
}

export function humanDate(date: Date): string {
    return format(date,"dd.MM.yyyy");
}
export function humanFinish(task: ScheduledTask): string {
    return humanDate(addDays(task.endExclusive,-1));
}
