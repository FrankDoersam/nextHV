import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { Overlay } from "./overlay";
import { ErrorState, SectionCard } from "./content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChoicePicker } from "@/components/fields/choice-picker";
import { useI18n } from "@/framework/i18n";
import { request } from "@/framework/data/http";
import { useInvalidateResource } from "@/framework/data/invalidate";
import type { ResourceDefinition } from "@/framework/types";

interface ImportField {
    name: string;
    label: string;
    type: string;
    match: string[];
}
interface Inspection {
    fields: ImportField[];
    headers: string[];
    sample: string[][];
    count: number;
}
interface Mapping {
    field: string;
    column: number;
    match?: string;
}
interface Preview {
    valid: boolean;
    token: string | null;
    expires_at: string | null;
    rows: {
        row: number;
        values: Record<string, string>;
        errors: Record<string, string[]>;
    }[];
}

/** One server-driven create-only import flow for every opted-in REST model. */
export function CsvImportDialog({
    resource,
    open,
    onClose,
    onImported,
}: {
    resource: ResourceDefinition;
    open: boolean;
    onClose: () => void;
    onImported?: () => void | Promise<void>;
}) {
    const { t } = useI18n();
    const [file, setFile] = useState<File>();
    const [inspection, setInspection] = useState<Inspection>();
    const [mapping, setMapping] = useState<Mapping[]>([]);
    const [preview, setPreview] = useState<Preview>();
    const [completed, setCompleted] = useState<number>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const lock = useRef(false);
    const abort = useRef<AbortController | null>(null);
    const invalidate = useInvalidateResource();
    useEffect(() => () => abort.current?.abort(), []);
    const base = `/api/v1/resource-features/${resource.name}/import`;
    const run = async (action: (signal: AbortSignal) => Promise<void>) => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError(undefined);
        const controller = new AbortController();
        abort.current = controller;
        try {
            await action(controller.signal);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure);
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    const inspect = () =>
        run(async (signal) => {
            if (!file) return;
            const body = new FormData();
            body.append("file", file);
            const result = await request<Inspection>(
                `${base}/inspect`,
                body,
                "POST",
                signal,
            );
            setInspection(result);
            const assigned = new Set<string>();
            setMapping(
                result.headers.flatMap((header, column) => {
                    const field = result.fields.find(
                        (field) =>
                            [field.label, field.name].some(
                                (text) =>
                                    text.toLocaleLowerCase() ===
                                    header.toLocaleLowerCase(),
                            ) && !assigned.has(field.name),
                    );
                    if (!field) return [];
                    assigned.add(field.name);
                    return [
                        {
                            field: field.name,
                            column,
                            ...(field.match.length
                                ? { match: field.match[0] }
                                : {}),
                        },
                    ];
                }),
            );
        });
    const verify = () =>
        run(async (signal) => {
            if (!file) return;
            const body = new FormData();
            body.append("file", file);
            body.append("mapping", JSON.stringify(mapping));
            setPreview(
                await request<Preview>(`${base}/preview`, body, "POST", signal),
            );
        });
    const commit = () =>
        run(async (signal) => {
            if (!preview?.valid || !preview.token || completed !== undefined)
                return;
            const result = await request<{ count: number }>(
                `${base}/commit`,
                { token: preview.token },
                "POST",
                signal,
            );
            setCompleted(result.count);
            await invalidate(resource);
            await onImported?.();
        });
    const setColumn = (column: number, fieldName: string | null) => {
        setPreview(undefined);
        const field = inspection?.fields.find(
            (entry) => entry.name === fieldName,
        );
        setMapping((previous) => [
            ...previous.filter(
                (entry) => entry.column !== column && entry.field !== fieldName,
            ),
            ...(field
                ? [
                      {
                          field: field.name,
                          column,
                          ...(field.match.length
                              ? { match: field.match[0] }
                              : {}),
                      },
                  ]
                : []),
        ]);
    };
    const label = (name: string) =>
        inspection?.fields.find((field) => field.name === name)?.label ??
        "Angabe";
    return (
        <Overlay
            open={open}
            onClose={onClose}
            title={`${resource.label} importieren`}
            description="Neue Datensätze aus einer CSV-Datei anlegen"
            icon={<FileSpreadsheet />}
            presentation="dialog"
            size="wide"
            busy={busy}
            header={
                <ol
                    className="flex flex-wrap gap-4 text-sm"
                    aria-label="Importschritte"
                >
                    {["Datei", "Feldzuordnung", "Vorschau", "Ergebnis"].map(
                        (name, index) => (
                            <li
                                key={name}
                                aria-current={
                                    (completed !== undefined
                                        ? 3
                                        : preview
                                          ? 2
                                          : inspection
                                            ? 1
                                            : 0) === index
                                        ? "step"
                                        : undefined
                                }
                                className="flex items-center gap-2 text-muted-foreground aria-[current=step]:font-medium aria-[current=step]:text-foreground"
                            >
                                <span className="flex size-6 items-center justify-center rounded-full border text-xs">
                                    {index + 1}
                                </span>
                                {name}
                            </li>
                        ),
                    )}
                </ol>
            }
            footer={
                <>
                    <Button variant="outline" disabled={busy} onClick={onClose}>
                        {completed !== undefined ? "Schließen" : "Abbrechen"}
                    </Button>
                    {completed === undefined && (
                        <Button
                            disabled={
                                busy ||
                                (!inspection && !file) ||
                                (!!inspection && !mapping.length) ||
                                (!!preview && !preview.valid)
                            }
                            onClick={() =>
                                void (preview
                                    ? commit()
                                    : inspection
                                      ? verify()
                                      : inspect())
                            }
                        >
                            {busy
                                ? "Wird verarbeitet …"
                                : preview
                                  ? t("importCount", {
                                        count: preview.rows.length,
                                    })
                                  : inspection
                                    ? "Vorschau prüfen"
                                    : "Datei prüfen"}
                        </Button>
                    )}
                </>
            }
        >
            <div className="space-y-5">
                {error != null && <ErrorState error={error} />}
                {completed !== undefined ? (
                    <div
                        role="status"
                        className="flex items-center gap-3 rounded-xl border bg-muted/30 p-5"
                    >
                        <CheckCircle2 className="size-6 shrink-0" />
                        <div>
                            <p className="font-medium">
                                {t("importedCount", { count: completed })}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Die Datensätze wurden angelegt.
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {!inspection && (
                            <SectionCard
                                title="CSV-Datei auswählen"
                                description="UTF-8 · Komma, Semikolon oder Tabulator · maximal 2 MB und 100 Datensätze je Import"
                            >
                                <label className="block space-y-3">
                                    <span className="flex items-center gap-2 text-sm font-medium">
                                        <Upload className="size-4" />
                                        Datei
                                    </span>
                                    <Input
                                        type="file"
                                        accept=".csv,text/csv,text/plain"
                                        disabled={busy}
                                        onChange={(event) => {
                                            setFile(event.target.files?.[0]);
                                            setError(undefined);
                                        }}
                                    />
                                </label>
                            </SectionCard>
                        )}
                        {inspection && !preview && (
                            <SectionCard
                                title="Felder zuordnen"
                                description={`${t("recordCount", { count: inspection.count })}. Nicht zugeordnete Spalten werden ignoriert; bestehende Datensätze bleiben unverändert.`}
                                actions={
                                    <Button
                                        variant="ghost"
                                        disabled={busy}
                                        onClick={() => {
                                            setInspection(undefined);
                                            setMapping([]);
                                        }}
                                    >
                                        Andere Datei
                                    </Button>
                                }
                            >
                                <div className="divide-y">
                                    {inspection.headers.map(
                                        (header, column) => {
                                            const entry = mapping.find(
                                                (entry) =>
                                                    entry.column === column,
                                            );
                                            const field =
                                                inspection.fields.find(
                                                    (field) =>
                                                        field.name ===
                                                        entry?.field,
                                                );
                                            return (
                                                <div
                                                    key={column}
                                                    className="grid min-w-0 gap-3 py-4 sm:grid-cols-[1fr_1fr_1fr]"
                                                >
                                                    <div className="min-w-0">
                                                        <p
                                                            className="truncate text-sm font-medium"
                                                            title={header}
                                                        >
                                                            {header}
                                                        </p>
                                                        <p
                                                            className="mt-1 truncate text-xs text-muted-foreground"
                                                            title={inspection.sample
                                                                .map(
                                                                    (row) =>
                                                                        row[
                                                                            column
                                                                        ],
                                                                )
                                                                .join(" · ")}
                                                        >
                                                            {inspection.sample
                                                                .map(
                                                                    (row) =>
                                                                        row[
                                                                            column
                                                                        ],
                                                                )
                                                                .join(" · ")}
                                                        </p>
                                                    </div>
                                                    <ChoicePicker
                                                        aria-label={`Zielfeld für ${header}`}
                                                        disabled={busy}
                                                        clearable
                                                        placeholder="Spalte überspringen"
                                                        value={
                                                            entry?.field ?? null
                                                        }
                                                        options={inspection.fields.map(
                                                            (field) => ({
                                                                value: field.name,
                                                                label: field.label,
                                                            }),
                                                        )}
                                                        onChange={(value) =>
                                                            setColumn(
                                                                column,
                                                                value == null
                                                                    ? null
                                                                    : String(
                                                                          value,
                                                                      ),
                                                            )
                                                        }
                                                    />
                                                    {field &&
                                                        field.match.length >
                                                            0 && (
                                                            <ChoicePicker
                                                                aria-label={`Beziehung suchen über ${header}`}
                                                                disabled={busy}
                                                                clearable={
                                                                    false
                                                                }
                                                                value={
                                                                    entry?.match ??
                                                                    field
                                                                        .match[0]
                                                                }
                                                                options={field.match.map(
                                                                    (
                                                                        match,
                                                                    ) => ({
                                                                        value: match,
                                                                        label:
                                                                            match ===
                                                                            "code"
                                                                                ? "Nummer"
                                                                                : match ===
                                                                                    "name"
                                                                                  ? "Bezeichnung"
                                                                                  : match ===
                                                                                      "id"
                                                                                    ? "ID"
                                                                                    : match,
                                                                    }),
                                                                )}
                                                                onChange={(
                                                                    value,
                                                                ) =>
                                                                    setMapping(
                                                                        (
                                                                            previous,
                                                                        ) =>
                                                                            previous.map(
                                                                                (
                                                                                    item,
                                                                                ) =>
                                                                                    item.column ===
                                                                                    column
                                                                                        ? {
                                                                                              ...item,
                                                                                              match: String(
                                                                                                  value,
                                                                                              ),
                                                                                          }
                                                                                        : item,
                                                                            ),
                                                                    )
                                                                }
                                                            />
                                                        )}
                                                </div>
                                            );
                                        },
                                    )}
                                </div>
                            </SectionCard>
                        )}
                        {preview && (
                            <SectionCard
                                title={
                                    preview.valid
                                        ? "Bereit zur Übernahme"
                                        : "Bitte die markierten Angaben prüfen"
                                }
                                description="Die Vorschau prüft Felder und Beziehungen. Bei der Übernahme werden zusätzlich alle Geschäftsregeln geprüft. Bei einem Fehler wird kein Datensatz angelegt."
                                actions={
                                    <Button
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => {
                                            setPreview(undefined);
                                            setError(undefined);
                                        }}
                                    >
                                        Zuordnung ändern
                                    </Button>
                                }
                            >
                                <div className="max-h-96 overflow-auto rounded-lg border">
                                    <table className="w-full table-fixed text-sm">
                                        <thead className="sticky top-0 z-10 bg-muted">
                                            <tr>
                                                <th className="w-16 p-3 text-left">
                                                    Zeile
                                                </th>
                                                <th className="p-3 text-left">
                                                    Vorschau und Prüfung
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {preview.rows.map((row) => (
                                                <tr key={row.row}>
                                                    <th className="p-3 align-top text-left font-normal text-muted-foreground">
                                                        {row.row}
                                                    </th>
                                                    <td className="space-y-2 p-3">
                                                        <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
                                                            {Object.entries(
                                                                row.values,
                                                            ).map(
                                                                ([
                                                                    name,
                                                                    value,
                                                                ]) => (
                                                                    <div
                                                                        key={
                                                                            name
                                                                        }
                                                                        className="min-w-0"
                                                                    >
                                                                        <dt className="text-xs text-muted-foreground">
                                                                            {label(
                                                                                name,
                                                                            )}
                                                                        </dt>
                                                                        <dd className="break-words">
                                                                            {value ||
                                                                                "—"}
                                                                        </dd>
                                                                    </div>
                                                                ),
                                                            )}
                                                        </dl>
                                                        {Object.entries(
                                                            row.errors,
                                                        ).map(
                                                            ([
                                                                name,
                                                                messages,
                                                            ]) => (
                                                                <div
                                                                    key={name}
                                                                    role="alert"
                                                                    className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-destructive"
                                                                >
                                                                    <p className="font-medium">
                                                                        {label(
                                                                            name,
                                                                        )}
                                                                    </p>
                                                                    <ul className="list-inside list-disc">
                                                                        {messages.map(
                                                                            (
                                                                                message,
                                                                            ) => (
                                                                                <li
                                                                                    key={
                                                                                        message
                                                                                    }
                                                                                >
                                                                                    {
                                                                                        message
                                                                                    }
                                                                                </li>
                                                                            ),
                                                                        )}
                                                                    </ul>
                                                                </div>
                                                            ),
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </SectionCard>
                        )}
                    </>
                )}
            </div>
        </Overlay>
    );
}
