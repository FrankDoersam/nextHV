import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PROJECT_START, TRADES, type RenovationTask, type TaskStatus, type Trade } from "@/lib/renovation/plan";

export function TaskEditor({
    task, allTasks, onCancel, onSave, onDelete,
}: {
    task: RenovationTask;
    allTasks: RenovationTask[];
    onCancel: () => void;
    onSave: (task: RenovationTask) => string | undefined;
    onDelete: (id: string) => string | undefined;
}) {
    const [draft, setDraft] = useState<RenovationTask>(task);
    const [error, setError] = useState("");
    const [deleteOpen, setDeleteOpen] = useState(false);
    const newTask = task.id === "__new__";
    const update = <K extends keyof RenovationTask>(field: K, value: RenovationTask[K]) =>
        setDraft((previous) => ({ ...previous, [field]: value }));

    const save = () => {
        if (!draft.title.trim()) return setError("Ein Titel ist erforderlich.");
        if (!Number.isInteger(draft.duration) || draft.duration < 1 || draft.duration > 365) {
            return setError("Dauer: ganze Zahl zwischen 1 und 365.");
        }
        const problem = onSave({ ...draft, title: draft.title.trim(), owner: draft.owner.trim() });
        if (problem) setError(problem);
    };

    return <>
        <Sheet open onOpenChange={(opened) => { if (!opened) onCancel(); }}>
            <SheetContent side="right" style={{width:"min(680px, 100vw)", maxWidth:"680px"}} className="h-full gap-0 overflow-hidden p-0 data-[side=right]:w-full">
                <form onSubmit={(event) => { event.preventDefault(); save(); }} className="flex min-h-0 flex-1 flex-col">
                    <SheetHeader className="shrink-0 border-b px-6 py-5">
                        <SheetTitle className="text-lg font-semibold">{newTask ? "Vorgang anlegen" : "Vorgang bearbeiten"}</SheetTitle>
                        <SheetDescription>Terminplanung, Verantwortliche und Abhängigkeiten</SheetDescription>
                    </SheetHeader>
                    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                            <FieldLabel htmlFor="reno-title">Bezeichnung</FieldLabel>
                            <Input id="reno-title" value={draft.title} onChange={(event) => update("title",event.target.value)} required />
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel htmlFor="reno-trade">Gewerk</FieldLabel>
                            <Select value={draft.trade} onValueChange={(v) => v && update("trade",v as Trade)}>
                                <SelectTrigger id="reno-trade" className="w-full"><SelectValue>{TRADES[draft.trade].label}</SelectValue></SelectTrigger>
                                <SelectContent>{Object.entries(TRADES).map(([key, meta]) =>
                                    <SelectItem key={key} value={key}>{meta.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel htmlFor="reno-duration">Dauer (Tage)</FieldLabel>
                            <Input id="reno-duration" inputMode="numeric" type="number" min={1} max={365}
                                value={draft.duration} onChange={(event) => update("duration",Number(event.target.value))} />
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel htmlFor="reno-not-before">Frühester Start</FieldLabel>
                            <Input id="reno-not-before" type="date" min={PROJECT_START}
                                value={draft.notBefore??""}
                                onChange={(event)=>update("notBefore",event.target.value||undefined)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel htmlFor="reno-status">Status</FieldLabel>
                            <Select value={draft.status} onValueChange={(v) => v && update("status",v as TaskStatus)}>
                                <SelectTrigger className="w-full" id="reno-status"><SelectValue>{draft.status==="geplant"?"Geplant":draft.status==="beauftragt"?"Beauftragt":"Erledigt"}</SelectValue></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="geplant">Geplant</SelectItem>
                                    <SelectItem value="beauftragt">Beauftragt</SelectItem>
                                    <SelectItem value="erledigt">Erledigt</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel htmlFor="reno-owner">Zuständiges Gewerk / Kontakt</FieldLabel>
                            <Input id="reno-owner" value={draft.owner} onChange={(event) => update("owner",event.target.value)} />
                        </div>
                    </div>
                    <Field orientation="horizontal" className="rounded-lg border p-3">
                        <Switch
                            id="reno-calendar-days"
                            checked={draft.mode==="kalendertage"}
                            onCheckedChange={(checked) => update("mode",checked?"kalendertage":"arbeitstage")}
                        />
                        <div className="space-y-0.5">
                            <FieldLabel htmlFor="reno-calendar-days">Kalendertage zählen</FieldLabel>
                            <FieldDescription>Für Estrichtrocknung und Lieferzeit; sonst werden Wochenenden übersprungen.</FieldDescription>
                        </div>
                    </Field>
                    <div className="space-y-2">
                        <FieldLabel>Vorgänger / Abhängigkeiten</FieldLabel>
                        <ScrollArea className="h-40 rounded-lg border p-2">
                            <div className="space-y-2">
                                {allTasks.filter((candidate) => candidate.id!==task.id).map((candidate) => (
                                    <label key={candidate.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
                                        <Checkbox
                                            checked={draft.dependsOn.includes(candidate.id)}
                                            onCheckedChange={(checked) => update("dependsOn",checked
                                                ? [...draft.dependsOn,candidate.id]
                                                : draft.dependsOn.filter((x) => x!==candidate.id))}
                                        />
                                        <span className="leading-5">{candidate.title}</span>
                                    </label>
                                ))}
                            </div>
                        </ScrollArea>
                        <FieldDescription>Abhängige Termine werden automatisch neu berechnet.</FieldDescription>
                    </div>
                    <div className="space-y-1.5">
                        <FieldLabel htmlFor="reno-notes">Leistungsbeschreibung / Hinweise</FieldLabel>
                        <textarea id="reno-notes" rows={3}
                            className="flex min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            value={draft.description} onChange={(event) => update("description",event.target.value)} />
                    </div>
                    {error && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                    </div>
                    <SheetFooter className="shrink-0 flex-row items-center justify-between border-t px-6 py-4">
                        {!newTask && <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
                            <Trash2 className="size-4" aria-hidden="true" /> Löschen
                        </Button>}
                        <div className="ml-auto flex gap-2">
                            <Button variant="outline" type="button" onClick={onCancel}>Abbrechen</Button>
                            <Button type="submit">Speichern</Button>
                        </div>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Vorgang löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Vorgänge mit Nachfolgern oder zugeordneten Belegen können nicht gelöscht werden.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => {
                        const problem = onDelete(task.id);
                        if (problem) { setError(problem); setDeleteOpen(false); }
                    }}>Löschen</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>;
}
