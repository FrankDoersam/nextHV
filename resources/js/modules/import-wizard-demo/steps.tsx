import { ArrowRight, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    automaticField,
    targetFields,
    targetOptions,
    type CsvView,
    type ImportTarget,
} from "./model";

type Mapping = Record<string, string>;

export function mappedField(
    column: string,
    mapping: Mapping,
    target: ImportTarget,
): string {
    return mapping[column] ?? automaticField(column, target) ?? "skip";
}

export function MapColumnsStep({
    view,
    target,
    mapping,
    onMap,
}: {
    view: CsvView;
    target: ImportTarget;
    mapping: Mapping;
    onMap: (column: string, field: string) => void;
}) {
    return (
        <section className="flex flex-col gap-5" aria-labelledby="reui-map-title">
            <div className="space-y-1">
                <h2 id="reui-map-title" className="text-base font-semibold">Map Columns</h2>
                <p className="text-sm text-muted-foreground">
                    Connect CSV columns with demo target fields. Nothing is saved to a database.
                </p>
            </div>
            <div className="space-y-3">
                {view.columns.map((column, index) => (
                    <div
                        key={index}
                        className="grid items-center gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_auto_1fr]"
                    >
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{column}</p>
                            <p className="truncate text-xs text-muted-foreground">
                                {view.rows[0]?.[index] ?? "No preview value"}
                            </p>
                        </div>
                        <ArrowRight aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
                        <Select
                            value={mappedField(column, mapping, target)}
                            onValueChange={(value) => onMap(column, value ?? "skip")}
                        >
                            <SelectTrigger
                                className="w-full"
                                aria-label={"Map " + column}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="skip">Skip column</SelectItem>
                                {targetFields[target].map((field) => (
                                    <SelectItem value={field.value} key={field.value}>
                                        {field.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function PreviewStep({
    view,
    target,
    mapping,
}: {
    view: CsvView;
    target: ImportTarget;
    mapping: Mapping;
}) {
    const columns = view.columns
        .map((name, index) => ({ name, index, field: mappedField(name, mapping, target) }))
        .filter((column) => column.field !== "skip");
    return (
        <section className="flex flex-col gap-5" aria-labelledby="reui-preview-title">
            <div className="space-y-1">
                <h2 id="reui-preview-title" className="text-base font-semibold">Preview</h2>
                <p className="text-sm text-muted-foreground">
                    Local sample only · up to {view.rows.length} rows shown, not a server validation.
                </p>
            </div>
            <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[460px] text-left text-sm">
                    <thead className="border-b bg-muted/50">
                        <tr>
                            {columns.map((column) => (
                                <th scope="col" key={column.index} className="px-3 py-2.5 font-medium">
                                    {targetFields[target].find((f) => f.value === column.field)?.label ?? column.name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {view.rows.map((row, index) => (
                            <tr key={index}>
                                {columns.map((column) => (
                                    <td className="max-w-56 truncate px-3 py-2.5" key={column.index}>
                                        {row[column.index] || "—"}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export function DuplicatesStep({
    count,
    skip,
    onSkipChange,
}: {
    count: number;
    skip: boolean;
    onSkipChange: (checked: boolean) => void;
}) {
    return (
        <section className="flex flex-col gap-5" aria-labelledby="reui-duplicates-title">
            <div className="space-y-1">
                <h2 id="reui-duplicates-title" className="text-base font-semibold">Duplicates</h2>
                <p className="text-sm text-muted-foreground">
                    Preview-only duplicate check using an email or the first column.
                </p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border p-4">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="space-y-1">
                    <p className="text-sm font-medium">
                        {count} possible duplicate{count === 1 ? "" : "s"} in the preview
                    </p>
                    <p className="text-sm text-muted-foreground">
                        This is not a full import scan or a server-side uniqueness check.
                    </p>
                </div>
            </div>
            <div className="flex items-start gap-3">
                <Switch
                    checked={skip}
                    onCheckedChange={onSkipChange}
                    aria-labelledby="reui-duplicates-skip-label"
                />
                <div>
                    <p id="reui-duplicates-skip-label" className="text-sm font-medium">
                        Skip possible duplicates
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Demo setting only; existing CRM records are never queried.
                    </p>
                </div>
            </div>
        </section>
    );
}

export function SummaryStep({
    view,
    target,
    mappedCount,
    duplicates,
    skipDuplicates,
    completed,
}: {
    view: CsvView;
    target: ImportTarget;
    mappedCount: number;
    duplicates: number;
    skipDuplicates: boolean;
    completed: boolean;
}) {
    return (
        <section className="flex flex-col gap-5" aria-labelledby="reui-summary-title">
            <div className="space-y-1">
                <h2 id="reui-summary-title" className="text-base font-semibold">Summary</h2>
                <p className="text-sm text-muted-foreground">
                    Review the local wizard settings. No API request will be made.
                </p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
                {[
                    ["Target", targetOptions.find((option) => option.value === target)?.label ?? target],
                    ["Rows reported", view.totalRows.toLocaleString("en-US")],
                    ["Mapped columns", String(mappedCount)],
                    ["Preview duplicates", String(duplicates)],
                    ["Skip duplicates", skipDuplicates ? "Yes" : "No"],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border p-3">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 text-sm font-medium">{value}</dd>
                    </div>
                ))}
            </dl>
            {completed ? (
                <div role="status" className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                    <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
                    Demo completed. No files were uploaded and no records were created.
                </div>
            ) : (
                <Badge variant="outline" className="self-start">
                    Ready to finish local demo
                </Badge>
            )}
        </section>
    );
}
