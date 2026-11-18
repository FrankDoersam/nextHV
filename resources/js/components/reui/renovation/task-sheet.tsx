"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Alert, AlertDescription } from "@/components/reui/alert";
import {
    Sheet18Layout,
    type Sheet18Tab,
} from "@/components/reui/sheet-18-layout";
import { SheetSection } from "@/components/ui/sheet";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
    Item,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from "@/components/ui/item";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    PROJECT_START,
    TRADES,
    type RenovationTask,
    type TaskStatus,
    type Trade,
} from "@/lib/renovation/plan";

export interface TaskEditorProps {
    task: RenovationTask;
    allTasks: RenovationTask[];
    onCancel: () => void;
    onSave: (task: RenovationTask) => string | undefined;
    onDelete: (id: string) => string | undefined;
}

/**
 * One central task editor built on the rendered ReUI sheet-18 hierarchy.
 * Its two tabs, header data and footer actions are passed as props to
 * Sheet18Layout; only actual project fields and validation live here.
 */
export function TaskEditor({
    task,
    allTasks,
    onCancel,
    onSave,
    onDelete,
}: TaskEditorProps) {
    const [draft, setDraft] = useState<RenovationTask>({
        ...task,
        dependsOn: [...task.dependsOn],
    });
    const [error, setError] = useState("");
    const [deleteOpen, setDeleteOpen] = useState(false);
    const isNew = task.id === "__new__";
    const update = <K extends keyof RenovationTask>(
        key: K,
        value: RenovationTask[K],
    ) => {
        setDraft((previous) => ({ ...previous, [key]: value }));
        setError("");
    };
    const submit = () => {
        if (!draft.title.trim()) {
            setError("Bitte eine Bezeichnung eingeben.");
            return;
        }
        if (
            !Number.isInteger(draft.duration) ||
            draft.duration < 1 ||
            draft.duration > 365
        ) {
            setError("Die Dauer muss zwischen 1 und 365 Tagen liegen.");
            return;
        }
        if (draft.notBefore && draft.notBefore < PROJECT_START) {
            setError("Der Vorgang darf nicht vor Projektbeginn starten.");
            return;
        }
        const problem = onSave({
            ...draft,
            title: draft.title.trim(),
            owner: draft.owner.trim(),
        });
        if (problem) setError(problem);
    };
    const statusLabel: Record<TaskStatus, string> = {
        geplant: "Geplant",
        beauftragt: "Beauftragt",
        erledigt: "Erledigt",
    };
    const statusVariant = {
        geplant: "secondary",
        beauftragt: "info-light",
        erledigt: "success-light",
    } as const;

    const errorView = error ? (
        <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
        </Alert>
    ) : null;

    const tabs: Sheet18Tab[] = [
        {
            value: "details",
            label: "Vorgang",
            content: (
                <FieldGroup>
                    {errorView}
                    <Field>
                        <FieldLabel htmlFor="reno-title">
                            Bezeichnung
                        </FieldLabel>
                        <Input
                            id="reno-title"
                            required
                            value={draft.title}
                            onChange={(event) =>
                                update("title", event.target.value)
                            }
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="reno-notes">
                            Leistungsbeschreibung
                        </FieldLabel>
                        <Textarea
                            id="reno-notes"
                            rows={3}
                            value={draft.description}
                            onChange={(event) =>
                                update("description", event.target.value)
                            }
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                            <FieldLabel htmlFor="reno-trade">Gewerk</FieldLabel>
                            <Select
                                value={draft.trade}
                                onValueChange={(value) =>
                                    value && update("trade", value as Trade)
                                }
                            >
                                <SelectTrigger
                                    id="reno-trade"
                                    className="w-full"
                                >
                                    <SelectValue>
                                        {TRADES[draft.trade].label}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent alignItemWithTrigger={false}>
                                    {Object.entries(TRADES).map(
                                        ([value, meta]) => (
                                            <SelectItem
                                                key={value}
                                                value={value}
                                            >
                                                {meta.label}
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="reno-status">
                                Status
                            </FieldLabel>
                            <Select
                                value={draft.status}
                                onValueChange={(value) =>
                                    value &&
                                    update("status", value as TaskStatus)
                                }
                            >
                                <SelectTrigger
                                    id="reno-status"
                                    className="w-full"
                                >
                                    <SelectValue>
                                        {statusLabel[draft.status]}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent alignItemWithTrigger={false}>
                                    {(
                                        Object.keys(statusLabel) as TaskStatus[]
                                    ).map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {statusLabel[value]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="reno-duration">
                                Dauer (Tage)
                            </FieldLabel>
                            <Input
                                id="reno-duration"
                                type="number"
                                min={1}
                                max={365}
                                inputMode="numeric"
                                value={draft.duration}
                                onChange={(event) =>
                                    update(
                                        "duration",
                                        Number(event.target.value),
                                    )
                                }
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="reno-not-before">
                                Frühester Start
                            </FieldLabel>
                            <Input
                                id="reno-not-before"
                                type="date"
                                min={PROJECT_START}
                                value={draft.notBefore ?? ""}
                                onChange={(event) =>
                                    update(
                                        "notBefore",
                                        event.target.value || undefined,
                                    )
                                }
                            />
                        </Field>
                    </div>
                    <Field>
                        <FieldLabel htmlFor="reno-owner">
                            Zuständig / Kontakt
                        </FieldLabel>
                        <Input
                            id="reno-owner"
                            value={draft.owner}
                            onChange={(event) =>
                                update("owner", event.target.value)
                            }
                        />
                    </Field>
                    <SheetSection>
                        <Field orientation="horizontal">
                            <FieldContent>
                                <FieldLabel htmlFor="reno-calendar-days">
                                    Kalendertage
                                </FieldLabel>
                                <FieldDescription>
                                    Wochenenden bei der Terminierung mitzählen.
                                </FieldDescription>
                            </FieldContent>
                            <Switch
                                id="reno-calendar-days"
                                checked={draft.mode === "kalendertage"}
                                onCheckedChange={(checked) =>
                                    update(
                                        "mode",
                                        checked
                                            ? "kalendertage"
                                            : "arbeitstage",
                                    )
                                }
                            />
                        </Field>
                    </SheetSection>
                </FieldGroup>
            ),
        },
        {
            value: "dependencies",
            label: "Abhängigkeiten",
            count: draft.dependsOn.length,
            content: (
                <FieldGroup>
                    {errorView}
                    <Field>
                        <FieldLabel>Vorgänger / Abhängigkeiten</FieldLabel>
                        <FieldDescription>
                            Ein Vorgang startet erst nach Abschluss aller
                            ausgewählten Vorgänger.
                        </FieldDescription>
                    </Field>
                    <ItemGroup
                        role="list"
                        aria-label="Vorgänger auswählen"
                        className="gap-2"
                    >
                        {allTasks
                            .filter((candidate) => candidate.id !== task.id)
                            .map((candidate) => {
                                const checked = draft.dependsOn.includes(
                                    candidate.id,
                                );
                                return (
                                    <Item
                                        key={candidate.id}
                                        role="listitem"
                                        size="sm"
                                        className={
                                            checked
                                                ? "border-primary/60 bg-primary/5"
                                                : ""
                                        }
                                    >
                                        <ItemMedia>
                                            <Checkbox
                                                id={"reno-dep-" + candidate.id}
                                                aria-label={
                                                    candidate.title +
                                                    " als Vorgänger"
                                                }
                                                checked={checked}
                                                onCheckedChange={(enabled) =>
                                                    update(
                                                        "dependsOn",
                                                        enabled
                                                            ? [
                                                                  ...draft.dependsOn,
                                                                  candidate.id,
                                                              ]
                                                            : draft.dependsOn.filter(
                                                                  (id) =>
                                                                      id !==
                                                                      candidate.id,
                                                              ),
                                                    )
                                                }
                                            />
                                        </ItemMedia>
                                        <ItemContent className="gap-0.5">
                                            <ItemTitle>
                                                <FieldLabel
                                                    className="block w-full cursor-pointer"
                                                    htmlFor={
                                                        "reno-dep-" +
                                                        candidate.id
                                                    }
                                                >
                                                    {candidate.title}
                                                </FieldLabel>
                                            </ItemTitle>
                                            <ItemDescription className="text-xs">
                                                {TRADES[candidate.trade].label}
                                            </ItemDescription>
                                        </ItemContent>
                                    </Item>
                                );
                            })}
                    </ItemGroup>
                </FieldGroup>
            ),
        },
    ];

    return (
        <>
            <Sheet18Layout
                open
                onOpenChange={(open) => {
                    if (!open) onCancel();
                }}
                reference={
                    isNew ? "VORGANG · NEU" : "VG-2027-" + task.id.toUpperCase()
                }
                title={
                    isNew
                        ? "Vorgang anlegen"
                        : draft.title || "Vorgang bearbeiten"
                }
                badge={
                    <Badge variant={statusVariant[draft.status]}>
                        {statusLabel[draft.status]}
                    </Badge>
                }
                description={
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5 tabular-nums">
                        <span>{TRADES[draft.trade].label}</span>
                        <span
                            aria-hidden="true"
                            className="size-1 shrink-0 rounded-full bg-muted-foreground/40"
                        />
                        <span>
                            {draft.duration}{" "}
                            {draft.mode === "kalendertage"
                                ? "Kalendertage"
                                : "Arbeitstage"}
                        </span>
                    </span>
                }
                tabs={tabs}
                initialTab="details"
                primaryLabel={isNew ? "Anlegen" : "Speichern"}
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
                onCancel={onCancel}
                destructiveAction={
                    isNew
                        ? undefined
                        : {
                              label: "Löschen",
                              icon: Trash2,
                              onClick: () => setDeleteOpen(true),
                          }
                }
            />
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Vorgang löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Vorgänge mit Nachfolgern oder zugeordneten Belegen
                            können nicht gelöscht werden.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                const problem = onDelete(task.id);
                                if (problem) {
                                    setError(problem);
                                    setDeleteOpen(false);
                                }
                            }}
                        >
                            Löschen
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
