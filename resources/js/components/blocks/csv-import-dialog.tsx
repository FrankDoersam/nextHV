import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Overlay } from "./overlay";
import { ErrorState, Loading, SectionCard } from "./content";
import { WizardProgress } from "./wizard-progress";
import { CsvImportMapping } from "./csv-import-mapping";
import { CsvImportPreview } from "./csv-import-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/framework/i18n";
import { request } from "@/framework/data/http";
import { useInvalidateResource } from "@/framework/data/invalidate";
import {
    importTypeLabel,
    type ImportInspection,
    type ImportMapping,
    type ImportPreview,
    type ImportSchema,
} from "@/framework/data/csv-import";
import type { ResourceDefinition } from "@/framework/types";

interface Props {
    resource: ResourceDefinition;
    open: boolean;
    onClose: () => void;
    onImported?: () => void | Promise<void>;
}

/** Closing or switching resources always starts a fresh file/mapping session. */
export function CsvImportDialog(props: Props) {
    return props.open ? (
        <CsvImportSession key={props.resource.name} {...props} />
    ) : null;
}

function CsvImportSession({ resource, onClose, onImported }: Props) {
    const { t } = useI18n();
    const [file, setFile] = useState<File>();
    const [inspection, setInspection] = useState<ImportInspection>();
    const [mapping, setMapping] = useState<ImportMapping[]>([]);
    const [preview, setPreview] = useState<ImportPreview>();
    const [completed, setCompleted] = useState<number>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const lock = useRef(false);
    const abort = useRef<AbortController | null>(null);
    const invalidate = useInvalidateResource();
    useEffect(() => () => abort.current?.abort(), []);
    const base = `/api/v1/resource-features/${resource.name}/import`;
    const schema = useQuery({
        queryKey: ["import-schema", resource.name],
        queryFn: ({ signal }) =>
            request<ImportSchema>(`${base}/schema`, undefined, "GET", signal),
        staleTime: 0,
        gcTime: 0,
        retry: false,
    });
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
            const result = await request<ImportInspection>(
                `${base}/inspect`,
                body,
                "POST",
                signal,
            );
            setInspection(result);
            setMapping(result.mapping);
        });
    const verify = () =>
        run(async (signal) => {
            if (!file) return;
            const body = new FormData();
            body.append("file", file);
            body.append("mapping", JSON.stringify(mapping));
            setPreview(
                await request<ImportPreview>(
                    `${base}/preview`,
                    body,
                    "POST",
                    signal,
                ),
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
            try {
                await invalidate(resource);
                await onImported?.();
            } catch {
                setError(
                    new Error(
                        "Der Import wurde gespeichert. Die Ansicht konnte nicht aktualisiert werden. Bitte schließen und die Tabelle neu laden.",
                    ),
                );
            }
        });
    const download = () => {
        if (!schema.data) return;
        const url = URL.createObjectURL(
            new Blob([schema.data.template], {
                type: "text/csv;charset=utf-8",
            }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${resource.name}-importvorlage.csv`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
    };
    const back = (step: number) => {
        setError(undefined);
        setPreview(undefined);
        if (step === 0) {
            setInspection(undefined);
            setMapping([]);
        }
    };
    const active =
        completed !== undefined ? 3 : preview ? 2 : inspection ? 1 : 0;
    return (
        <Overlay
            open
            onClose={onClose}
            title={`${resource.label} importieren`}
            description="Neue Datensätze aus einer CSV-Datei anlegen"
            icon={<FileSpreadsheet />}
            presentation="dialog"
            size="wide"
            wizard
            bodyResetKey={active}
            busy={busy}
            header={
                <WizardProgress
                    steps={[
                        { id: "file", label: "Datei" },
                        { id: "mapping", label: "Zuordnung" },
                        { id: "preview", label: "Vorschau" },
                        { id: "result", label: "Ergebnis" },
                    ]}
                    active={active}
                    label="Importschritte"
                    busy={busy}
                    onSelect={completed === undefined ? back : undefined}
                />
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
                                schema.isPending ||
                                !!schema.error ||
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
            <div className="space-y-5" aria-busy={busy}>
                {error != null && <ErrorState error={error} />}
                {schema.error && (
                    <ErrorState
                        error={schema.error}
                        retry={() => void schema.refetch()}
                    />
                )}
                {completed !== undefined ? (
                    <div
                        role="status"
                        className="flex flex-col items-center gap-3 py-10 text-center"
                    >
                        <CheckCircle2 className="size-10 text-primary" />
                        <h3 className="text-lg font-semibold">
                            {t("importedCount", { count: completed })}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Alle Datensätze wurden gemeinsam gespeichert.
                        </p>
                    </div>
                ) : (
                    <>
                        {!inspection && (
                            <SectionCard
                                title="CSV-Datei auswählen"
                                description={`UTF-8 · Komma, Semikolon oder Tabulator · maximal 2 MB und ${schema.data?.limits.rows ?? 100} Datensätze je Import`}
                                actions={
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!schema.data || busy}
                                        onClick={download}
                                    >
                                        <Download />
                                        Vorlage
                                    </Button>
                                }
                            >
                                {schema.isPending ? (
                                    <Loading rows={1} />
                                ) : (
                                    <div className="space-y-5">
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
                                                    setFile(
                                                        event.target.files?.[0],
                                                    );
                                                    setError(undefined);
                                                }}
                                            />
                                        </label>
                                        <details className="rounded-lg border bg-muted/20 p-4">
                                            <summary className="cursor-pointer text-sm font-medium">
                                                Importierbare Felder und
                                                erlaubte Werte
                                            </summary>
                                            <div className="mt-3 grid gap-4 sm:grid-cols-2">
                                                {schema.data?.fields.map(
                                                    (field) => (
                                                        <div
                                                            key={field.name}
                                                            className="min-w-0 space-y-1"
                                                        >
                                                            <p className="text-sm font-medium">
                                                                {field.label}{" "}
                                                                {field.required && (
                                                                    <Badge variant="outline">
                                                                        Pflichtfeld
                                                                    </Badge>
                                                                )}
                                                            </p>
                                                            <p className="text-xs leading-5 text-muted-foreground">
                                                                {importTypeLabel(
                                                                    field,
                                                                )}
                                                                {field.options
                                                                    .length >
                                                                    0 &&
                                                                    ` · ${field.options.map((option) => option.label).join(", ")}`}
                                                                {field
                                                                    .matchOptions
                                                                    .length >
                                                                    0 &&
                                                                    ` · Zuordnung über ${field.matchOptions.map((option) => option.label).join(" oder ")}`}
                                                            </p>
                                                        </div>
                                                    ),
                                                )}
                                            </div>
                                        </details>
                                    </div>
                                )}
                            </SectionCard>
                        )}
                        {inspection && !preview && (
                            <SectionCard
                                title="Felder zuordnen"
                                description={`${t("recordCount", { count: inspection.count })}. Übersprungene Spalten werden nicht importiert.`}
                                actions={
                                    <Button
                                        variant="ghost"
                                        disabled={busy}
                                        onClick={() => back(0)}
                                    >
                                        Andere Datei
                                    </Button>
                                }
                            >
                                <CsvImportMapping
                                    inspection={inspection}
                                    mapping={mapping}
                                    onChange={setMapping}
                                    busy={busy}
                                />
                            </SectionCard>
                        )}
                        {preview && inspection && (
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
                                        onClick={() => back(1)}
                                    >
                                        Zuordnung ändern
                                    </Button>
                                }
                            >
                                <CsvImportPreview
                                    preview={preview}
                                    fields={inspection.fields}
                                />
                            </SectionCard>
                        )}
                    </>
                )}
            </div>
        </Overlay>
    );
}
