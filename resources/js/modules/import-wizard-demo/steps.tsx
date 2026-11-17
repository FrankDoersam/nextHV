import { CircleAlert, CircleCheck } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { automaticField, targetFields, targetOptions, type CsvView, type ImportTarget } from "./model";

type Mapping = Record<string, string>;
export type DuplicateMode = "skip" | "update" | "create";
export const mappedField = (column: string, mapping: Mapping, target: ImportTarget) =>
    mapping[column] ?? automaticField(column, target) ?? "skip";

export function MapColumnsStep({
    view, target, mapping, onMap, isExample,
}: {
    view: CsvView; target: ImportTarget; mapping: Mapping;
    onMap: (column: string, field: string) => void; isExample: boolean;
}) {
    const requiredMissing = target === "contacts"
        ? ["fullName", "email", "owner"].filter((name) =>
            !view.columns.some((column) => mappedField(column, mapping, target) === name))
        : [];
    return <section className="flex flex-col gap-6" aria-labelledby="reui-map-title">
        <div className="flex flex-col gap-1">
            <h2 id="reui-map-title" className="text-base font-semibold">Map Columns</h2>
            <p className="text-sm text-muted-foreground">Match each CSV column to a {targetOptions.find((v) => v.value === target)?.label} field.</p>
        </div>
        {requiredMissing.length > 0 && <Alert className="border-warning/30 bg-warning/4">
            <CircleAlert className="text-warning" aria-hidden="true" />
            <AlertTitle>Required field not mapped</AlertTitle>
            <AlertDescription><p>{requiredMissing.map((name) => targetFields[target].find((f) => f.value === name)?.label ?? name).join(", ")} needs a target field before validation.</p></AlertDescription>
        </Alert>}
        <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[640px] table-auto" aria-label="Column mapping">
                <TableHeader><TableRow>
                    <TableHead className="w-[34%]">CSV column</TableHead>
                    <TableHead className="w-[26%]">Sample</TableHead>
                    <TableHead>CRM field</TableHead>
                </TableRow></TableHeader>
                <TableBody>{view.columns.map((column, index) => <TableRow key={index}>
                    <TableCell className="font-medium">
                        {column}{isExample && ["Name", "Email", "Owner"].includes(column) && <span className="ml-0.5 text-destructive">*</span>}
                    </TableCell>
                    <TableCell className="max-w-52 truncate text-muted-foreground">{view.rows[0]?.[index] || "—"}</TableCell>
                    <TableCell>
                        <Select value={mappedField(column, mapping, target)} onValueChange={(value) => onMap(column, value ?? "skip")}>
                            <SelectTrigger aria-label={"Map " + column} className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="skip">Do not import</SelectItem>
                                {targetFields[target].map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </TableCell>
                </TableRow>)}</TableBody>
            </Table>
        </div>
    </section>;
}

type RowStatus = "Valid" | "Warning" | "Error";
function validateEmail(email: string): RowStatus {
    return !email ? "Error" : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Valid" : "Warning";
}
export function PreviewStep({
    view, target, mapping, isExample, uniqueKey, onUniqueKey,
}: {
    view: CsvView; target: ImportTarget; mapping: Mapping; isExample: boolean;
    uniqueKey: string; onUniqueKey: (value: string) => void;
}) {
    const indexOf = (field: string) => view.columns.findIndex((column) => mappedField(column, mapping, target) === field);
    const name = indexOf("fullName"), email = indexOf("email"), account = indexOf("account");
    const rows = view.rows.slice(0, 5);
    const statuses = rows.map((row) => validateEmail(row[email] ?? ""));
    const totals = isExample
        ? [1212, 24, 12]
        : ["Valid", "Warning", "Error"].map((type) => statuses.filter((s) => s === type).length);
    return <section className="flex flex-col gap-6" aria-labelledby="reui-preview-title">
        <div className="flex flex-col gap-1">
            <h2 id="reui-preview-title" className="text-base font-semibold">Preview Rows</h2>
            <p className="text-sm text-muted-foreground">First {rows.length} of {view.totalRows.toLocaleString("en-US")} rows after mapping.</p>
        </div>
        <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[640px] table-auto" aria-label="Row preview">
                <TableHeader><TableRow>
                    <TableHead className="w-[26%]">Full name</TableHead><TableHead className="w-[30%]">Email</TableHead>
                    <TableHead className="hidden sm:table-cell">Account</TableHead><TableHead className="w-24 text-right">Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>{rows.map((row, i) => <TableRow key={i}>
                    <TableCell className="font-medium">{row[name] || "Missing"}</TableCell>
                    <TableCell className="text-muted-foreground">{row[email] || "Missing"}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{row[account] || "—"}</TableCell>
                    <TableCell className="text-right"><Badge variant="outline" className="gap-1.5">
                        <span aria-hidden="true" className={"size-1.5 rounded-full " + (statuses[i] === "Valid" ? "bg-emerald-500" : statuses[i] === "Warning" ? "bg-amber-500" : "bg-rose-500")} />{statuses[i]}
                    </Badge></TableCell>
                </TableRow>)}</TableBody>
            </Table>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">{[
            [totals[0], "valid", "bg-emerald-500"], [totals[1], "warnings", "bg-amber-500"],
            [totals[2], "errors", "bg-rose-500"],
        ].map(([count, label, dot]) => <Item key={String(label)} className="gap-2 p-2.5">
            <span aria-hidden="true" className={"size-1.5 shrink-0 rounded-full " + dot} />
            <ItemContent><ItemTitle className="tabular-nums">{Number(count).toLocaleString("de-DE")} {label}</ItemTitle></ItemContent>
        </Item>)}</div>
        <div className="flex flex-col gap-2">
            <label htmlFor="reui-unique-key" className="text-sm font-medium">Unique key</label>
            <Select value={uniqueKey} onValueChange={(value) => value && onUniqueKey(value)}>
                <SelectTrigger id="reui-unique-key" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="fullName">Full name</SelectItem><SelectItem value="phone">Phone</SelectItem></SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Rows match existing contacts on this column.</p>
        </div>
    </section>;
}

const duplicateChoices = [
    { value: "skip" as const, title: "Skip existing", badge: "Safest", variant: "success-light" as const },
    { value: "update" as const, title: "Update existing", badge: "Recommended", variant: "info-light" as const },
    { value: "create" as const, title: "Create new", badge: "Risky", variant: "warning-light" as const },
];
export function DuplicatesStep({
    count, mode, onModeChange, isExample,
}: {
    count: number; mode: DuplicateMode; onModeChange: (value: DuplicateMode) => void;
    isExample: boolean;
}) {
    const matches = isExample ? 36 : count;
    const descriptions = {
        skip: "Keep current records. " + matches + " matched contacts stay untouched.",
        update: "Overwrite mapped fields on the " + matches + " matched contacts.",
        create: "Add every row as a new contact, duplicates included.",
    };
    return <section className="flex flex-col gap-6" aria-labelledby="reui-duplicates-title">
        <div className="flex flex-col gap-1">
            <h2 id="reui-duplicates-title" className="text-base font-semibold">Duplicate Handling</h2>
            <p className="text-sm text-muted-foreground">
                {matches} rows match {isExample ? "an existing contact by email." : "another row in the local preview."}
            </p>
        </div>
        <RadioGroup value={mode} onValueChange={(value) => onModeChange(value as DuplicateMode)} aria-label="Duplicate handling">
            {duplicateChoices.map((choice) => <label key={choice.value} className={
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 " +
                (mode === choice.value ? "border-primary bg-primary/5" : "")
            }>
                <RadioGroupItem value={choice.value} aria-label={choice.title} className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{choice.title}</span><Badge variant={choice.variant}>{choice.badge}</Badge></span>
                    <span className="text-sm font-normal text-muted-foreground">{descriptions[choice.value]}</span>
                </span>
            </label>)}
        </RadioGroup>
    </section>;
}
export function SummaryStep({
    view, target, files, duplicateMode, uniqueKey, duplicates, isExample, completed,
}: {
    view: CsvView; target: ImportTarget; files: string;
    duplicateMode: DuplicateMode; uniqueKey: string; duplicates: number;
    isExample: boolean; completed: boolean;
}) {
    const bad = isExample ? 12 : view.rows.filter((row) => !row.some((cell) => cell.includes("@"))).length;
    const duplicateCount = isExample ? 36 : duplicates;
    const validRows = isExample ? 1212 : view.totalRows - bad;
    const importing = Math.max(0, validRows - (duplicateMode === "skip" ? duplicateCount : 0));
    const detail = importing.toLocaleString("en-US") + " contacts planned, " +
        (duplicateMode === "skip" ? duplicateCount : 0) + " skipped, " + bad + " errors held back.";
    return <section className="flex flex-col gap-6" aria-labelledby="reui-summary-title">
        <div className="flex flex-col gap-1">
            <h2 id="reui-summary-title" className="text-base font-semibold">Run Import</h2>
            <p className="text-sm text-muted-foreground">Review the plan before it writes to the CRM.</p>
        </div>
        <Alert className="border-success/30 bg-success/4">
            <CircleCheck className="text-success" aria-hidden="true" />
            <AlertTitle>{completed ? "Demo completed" : "Ready to import"}</AlertTitle>
            <AlertDescription><p>{completed ? "No files were uploaded and no records were changed." : detail}</p></AlertDescription>
        </Alert>
        <section className="flex min-w-0 flex-col gap-3 rounded-md border border-border/70 p-4">
            <h3 className="text-sm font-semibold">Import plan</h3>
            <dl className="flex flex-col gap-2.5">{[
                ["File", files],
                ["Object", targetOptions.find((item) => item.value === target)?.label ?? target],
                ["Unique key", targetFields.contacts.find((item) => item.value === uniqueKey)?.label ?? uniqueKey],
                ["Duplicates", duplicateChoices.find((item) => item.value === duplicateMode)?.title ?? duplicateMode],
            ].map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
            </div>)}</dl>
        </section>
        {!isExample && <p className="text-xs text-muted-foreground">Local sample only; no CRM database has been checked.</p>}
    </section>;
}
