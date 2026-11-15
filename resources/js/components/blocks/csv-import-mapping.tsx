import { ArrowRight, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChoicePicker } from "@/components/fields/choice-picker";
import {
    automaticImportOption,
    normalizeImportValue,
    importTypeLabel,
    type ImportInspection,
    type ImportMapping,
} from "@/framework/data/csv-import";

/** Schema-owned choices and relation labels; no resource-specific import UI. */
export function CsvImportMapping({
    inspection,
    mapping,
    onChange,
    busy,
}: {
    inspection: ImportInspection;
    mapping: ImportMapping[];
    onChange: (mapping: ImportMapping[]) => void;
    busy: boolean;
}) {
    const missing = inspection.fields.filter(
        (field) =>
            field.required &&
            !mapping.some((entry) => entry.field === field.name),
    );
    const setEntry = (column: number, entry?: ImportMapping) =>
        onChange(
            [
                ...mapping.filter((item) => item.column !== column),
                ...(entry ? [entry] : []),
            ].sort((a, b) => a.column - b.column),
        );
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2" aria-live="polite">
                <Badge variant="secondary">{mapping.length} zugeordnet</Badge>
                <Badge variant="outline">
                    {inspection.headers.length - mapping.length} übersprungen
                </Badge>
                {missing.length > 0 && (
                    <Badge variant="destructive">
                        {missing.length} Pflichtfelder fehlen
                    </Badge>
                )}
            </div>
            {missing.length > 0 && (
                <p className="text-sm text-destructive">
                    Noch zuordnen:{" "}
                    {missing.map((field) => field.label).join(", ")}
                </p>
            )}
            <div className="divide-y">
                {inspection.headers.map((header, column) => {
                    const entry = mapping.find(
                        (item) => item.column === column,
                    );
                    const field = inspection.fields.find(
                        (item) => item.name === entry?.field,
                    );
                    const values =
                        inspection.values[column]?.filter(
                            (value) => value !== "",
                        ) ?? [];
                    const unknown = field
                        ? values.filter(
                              (value) =>
                                  automaticImportOption(
                                      value,
                                      field.options,
                                  ) === null,
                          )
                        : [];
                    return (
                        <div key={column} className="min-w-0 space-y-3 py-4">
                            <div className="grid min-w-0 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.5fr)]">
                                <div className="min-w-0 space-y-1">
                                    <p className="break-words text-sm font-medium">
                                        {header}
                                    </p>
                                    <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                                        {inspection.sample
                                            .map((row) => row[column])
                                            .join(" · ") || "Leere Werte"}
                                    </p>
                                </div>
                                <ArrowRight
                                    className="mt-2 hidden size-4 text-muted-foreground sm:block"
                                    aria-hidden
                                />
                                <div className="min-w-0 space-y-2">
                                    <ChoicePicker
                                        aria-label={`Zielfeld für ${header}`}
                                        disabled={busy}
                                        clearable
                                        placeholder="Spalte überspringen"
                                        value={entry?.field ?? null}
                                        options={inspection.fields.map(
                                            (item) => ({
                                                value: item.name,
                                                label: item.label,
                                                description:
                                                    importTypeLabel(item),
                                                badge: item.required
                                                    ? "Pflichtfeld"
                                                    : undefined,
                                                disabled: mapping.some(
                                                    (other) =>
                                                        other.field ===
                                                            item.name &&
                                                        other.column !== column,
                                                ),
                                            }),
                                        )}
                                        onChange={(name) => {
                                            const next = inspection.fields.find(
                                                (item) => item.name === name,
                                            );
                                            setEntry(
                                                column,
                                                next
                                                    ? {
                                                          column,
                                                          field: next.name,
                                                          ...(next.match.length
                                                              ? {
                                                                    match: next
                                                                        .match[0],
                                                                }
                                                              : {}),
                                                      }
                                                    : undefined,
                                            );
                                        }}
                                    />
                                    {field && (
                                        <p className="text-xs text-muted-foreground">
                                            {importTypeLabel(field)}
                                            {field.required
                                                ? " · Pflichtfeld"
                                                : " · Optional"}
                                        </p>
                                    )}
                                    {field?.relation && entry && (
                                        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                                            <p className="flex items-center gap-2 text-xs font-medium">
                                                <Link2 className="size-3.5" />
                                                Bestehenden Datensatz finden
                                            </p>
                                            <ChoicePicker
                                                aria-label={`Beziehung suchen über ${header}`}
                                                disabled={busy}
                                                clearable={false}
                                                value={
                                                    entry.match ??
                                                    field.match[0]
                                                }
                                                options={field.matchOptions}
                                                onChange={(match) =>
                                                    setEntry(column, {
                                                        ...entry,
                                                        match: String(match),
                                                    })
                                                }
                                            />
                                            <p className="text-xs leading-5 text-muted-foreground">
                                                Exakter, eindeutiger Treffer
                                                erforderlich. Fehlende oder
                                                mehrdeutige Beziehungen werden
                                                vor dem Import angezeigt.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {field && entry && field.options.length > 0 && (
                                <details
                                    key={`${column}-${field.name}`}
                                    open={unknown.length > 0 ? true : undefined}
                                    className="rounded-lg border bg-muted/20 p-3"
                                >
                                    <summary className="cursor-pointer text-sm font-medium">
                                        Auswahlwerte zuordnen{" "}
                                        <span className="font-normal text-muted-foreground">
                                            · {values.length} Werte
                                        </span>
                                    </summary>
                                    <p className="py-2 text-xs leading-5 text-muted-foreground">
                                        Bezeichnungen und technische Werte
                                        werden automatisch erkannt. Abweichende
                                        Bezeichnungen hier einem erlaubten Wert
                                        zuweisen.
                                    </p>
                                    <div className="grid gap-2">
                                        {values.map((value) => {
                                            const explicit = entry.values?.find(
                                                (item) =>
                                                    normalizeImportValue(
                                                        item.from,
                                                    ) ===
                                                    normalizeImportValue(value),
                                            )?.to;
                                            const automatic =
                                                automaticImportOption(
                                                    value,
                                                    field.options,
                                                );
                                            return (
                                                <div
                                                    key={value}
                                                    className="grid min-w-0 items-center gap-2 sm:grid-cols-2"
                                                >
                                                    <span className="break-words text-sm">
                                                        {value}
                                                    </span>
                                                    <ChoicePicker
                                                        aria-label={`${field.label}: ${value} zuordnen`}
                                                        disabled={busy}
                                                        value={
                                                            explicit ??
                                                            automatic
                                                        }
                                                        options={field.options}
                                                        clearable={false}
                                                        placeholder="Wert zuordnen …"
                                                        onChange={(to) => {
                                                            if (
                                                                typeof to !==
                                                                    "string" &&
                                                                typeof to !==
                                                                    "number"
                                                            )
                                                                return;
                                                            setEntry(column, {
                                                                ...entry,
                                                                values: [
                                                                    ...(
                                                                        entry.values ??
                                                                        []
                                                                    ).filter(
                                                                        (
                                                                            item,
                                                                        ) =>
                                                                            item.from !==
                                                                            value,
                                                                    ),
                                                                    {
                                                                        from: value,
                                                                        to,
                                                                    },
                                                                ],
                                                            });
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </details>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
