import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ImportField, ImportPreview } from "@/framework/data/csv-import";

export function CsvImportPreview({
    preview,
    fields,
}: {
    preview: ImportPreview;
    fields: ImportField[];
}) {
    const [errorsOnly, setErrorsOnly] = useState(false);
    const invalid = preview.rows.filter(
        (row) => Object.keys(row.errors).length > 0,
    );
    const rows = errorsOnly ? invalid : preview.rows;
    const label = (name: string) =>
        fields.find((field) => field.name === name)?.label ?? "Angabe";
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                    {preview.rows.length - invalid.length} gültig
                </Badge>
                <Badge variant={invalid.length ? "destructive" : "outline"}>
                    {invalid.length} mit Fehlern
                </Badge>
                {invalid.length > 0 && (
                    <Button
                        size="sm"
                        variant="outline"
                        aria-pressed={errorsOnly}
                        onClick={() => setErrorsOnly((value) => !value)}
                    >
                        {errorsOnly ? "Alle Zeilen" : "Nur Fehler"}
                    </Button>
                )}
            </div>
            <div className="max-h-96 overflow-y-auto rounded-lg border">
                <table className="w-full table-fixed text-sm">
                    <thead className="sticky top-0 z-10 bg-muted">
                        <tr>
                            <th className="w-16 p-3 text-left">Zeile</th>
                            <th className="p-3 text-left">
                                Vorschau und Prüfung
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {rows.map((row) => (
                            <tr key={row.row}>
                                <th className="p-3 text-left align-top font-normal text-muted-foreground">
                                    {row.row}
                                </th>
                                <td className="space-y-3 p-3">
                                    <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                                        {Object.entries(row.values).map(
                                            ([name, value]) => (
                                                <div
                                                    key={name}
                                                    className="min-w-0"
                                                >
                                                    <dt className="text-xs text-muted-foreground">
                                                        {label(name)}
                                                    </dt>
                                                    <dd className="break-words font-medium">
                                                        {value || "—"}
                                                    </dd>
                                                </div>
                                            ),
                                        )}
                                    </dl>
                                    {Object.entries(row.errors).map(
                                        ([name, messages]) => (
                                            <div
                                                key={name}
                                                role="alert"
                                                className="space-y-1 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-destructive"
                                            >
                                                <p className="font-medium">
                                                    {label(name)}
                                                </p>
                                                <ul className="list-inside list-disc break-words">
                                                    {messages.map((message) => (
                                                        <li key={message}>
                                                            {message}
                                                        </li>
                                                    ))}
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
            {preview.valid && preview.expires_at && (
                <p className="text-xs text-muted-foreground">
                    Die geprüfte Vorschau ist 15 Minuten gültig. Alle Datensätze
                    werden gemeinsam übernommen.
                </p>
            )}
        </div>
    );
}
