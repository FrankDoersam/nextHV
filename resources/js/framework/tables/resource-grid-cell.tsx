import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { ChoicePicker } from "@/components/fields/choice-picker";
import { CurrencyField } from "@/components/fields/currency-field";
import { NumberStepper } from "@/components/fields/number-stepper";
import { DatePicker, dateControlError } from "@/components/fields/pickers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useSaveRecord } from "../data/hooks";
import { resolveDataProvider } from "../data/provider-registry";
import { can, usePermissionRevision } from "../permissions";
import type {
    CellDraftValues,
    CellScalar,
    ColumnDefinition,
    ColumnInputDefinition,
    RecordData,
    ResourceDefinition,
} from "../types";
import { CellRenderer } from "./cell-renderer";
import { cellNumber, evaluateColumn } from "./column-calculations";

function normalizedValue(
    value: unknown,
    input: ColumnInputDefinition,
): CellScalar {
    if (value == null || value === "") return null;
    if (["number", "percent", "currency"].includes(input.kind))
        return cellNumber(value);
    if (input.kind === "boolean")
        return typeof value === "boolean" ? value : null;
    if (input.kind === "choice")
        return (
            input.options?.find(
                (option) => String(option.value) === String(value),
            )?.value ?? null
        );
    if (
        input.kind === "date" &&
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}T/.test(value)
    )
        return value.slice(0, 10);
    return typeof value === "string" || typeof value === "number"
        ? String(value)
        : null;
}

export function cellInputError(
    value: CellScalar,
    input: ColumnInputDefinition,
): string | undefined {
    if (value === null || value === "")
        return input.nullable === false
            ? "Bitte einen Wert eingeben."
            : undefined;
    if (["number", "percent", "currency"].includes(input.kind)) {
        const number = cellNumber(value);
        if (number === null) return "Bitte eine gültige Zahl eingeben.";
        if (input.integer && !Number.isInteger(number))
            return "Bitte eine ganze Zahl eingeben.";
        if (input.min !== undefined && number < input.min)
            return `Der Wert muss mindestens ${input.min} betragen.`;
        if (input.max !== undefined && number > input.max)
            return `Der Wert darf höchstens ${input.max} betragen.`;
    }
    if (input.kind === "date")
        return dateControlError(value, {
            clearable: input.nullable !== false,
            minDate: input.minDate,
            maxDate: input.maxDate,
        });
    if (input.kind === "boolean" && typeof value !== "boolean")
        return "Bitte Ja oder Nein auswählen.";
    if (
        input.kind === "choice" &&
        !input.options?.some((option) => option.value === value)
    )
        return "Bitte einen verfügbaren Wert auswählen.";
}

export function ResourceGridCell({
    resource,
    row,
    column,
    columns = resource.columns,
    draft = {},
    onDraftChange,
    disabled = false,
}: {
    resource: ResourceDefinition;
    row: RecordData;
    column: ColumnDefinition;
    columns?: readonly ColumnDefinition[];
    draft?: CellDraftValues;
    onDraftChange?: (field: string, value: CellScalar) => void;
    disabled?: boolean;
}) {
    const save = useSaveRecord(resource);
    usePermissionRevision();
    const errorId = useId();
    const [local, setLocal] = useState<CellScalar | undefined>();
    const [failure, setFailure] = useState<string>();
    const [busy, setBusy] = useState(false);
    const committing = useRef(false);
    const latest = useRef(row);
    latest.current = row;
    useEffect(() => {
        setLocal(undefined);
        setFailure(undefined);
    }, [row.id, row.updated_at, column.field]);

    if (!column.input || column.computed)
        return (
            <CellRenderer
                column={column}
                row={row}
                columns={columns}
                draft={draft}
            />
        );
    const field = resource.fields.find(
        (definition) => definition.name === column.field,
    );
    const persistent =
        column.input.mode === "record" &&
        !!field &&
        !field.readonlyOnEdit &&
        !field.disabled;
    const input: ColumnInputDefinition = {
        ...column.input,
        options: column.input.options ?? column.options ?? field?.options,
        min: column.input.min ?? (persistent ? field?.min : undefined),
        max: column.input.max ?? (persistent ? field?.max : undefined),
        nullable:
            column.input.nullable ?? (persistent ? !field?.required : true),
    };
    const baseline = normalizedValue(row[column.field], input);
    const value = persistent
        ? local === undefined
            ? baseline
            : local
        : normalizedValue(
              Object.hasOwn(draft, column.field)
                  ? draft[column.field]
                  : evaluateColumn(row, column, columns, draft),
              input,
          );
    const validation = cellInputError(value, input);
    const error = failure ?? validation;
    const writable = persistent
        ? !!row.updated_at && can(resource.name, "edit", row)
        : !!onDraftChange;
    const blocked = disabled || busy || !writable;
    const changed =
        persistent && local !== undefined && !Object.is(local, baseline);
    const label = `${column.label} – ${String(row[resource.titleField] ?? row.id)}`;
    const change = (next: CellScalar) => {
        setFailure(undefined);
        if (blocked) return;
        if (persistent) setLocal(next);
        else onDraftChange?.(column.field, next);
    };
    const commit = async () => {
        if (
            !persistent ||
            !field ||
            blocked ||
            committing.current ||
            !changed ||
            validation
        )
            return;
        committing.current = true;
        setBusy(true);
        setFailure(undefined);
        const original = row;
        const values = Object.fromEntries(
            resource.fields.map((definition) => [
                definition.name,
                definition.name === column.field
                    ? value
                    : original[definition.name],
            ]),
        );
        try {
            await resolveDataProvider(resource).validate(
                resource,
                values,
                original,
                [column.field],
            );
            if (
                latest.current.id !== original.id ||
                latest.current.updated_at !== original.updated_at
            )
                throw new Error(
                    "Der Datensatz wurde inzwischen geändert. Bitte den aktuellen Wert verwenden.",
                );
            if (!can(resource.name, "edit", original))
                throw new Error(
                    "Die Berechtigung zum Bearbeiten ist nicht mehr verfügbar.",
                );
            await save(values, original);
            setLocal(undefined);
        } catch (error) {
            setFailure(
                error instanceof Error
                    ? error.message
                    : "Die Änderung konnte nicht gespeichert werden.",
            );
        } finally {
            committing.current = false;
            setBusy(false);
        }
    };
    const accessibility = {
        "aria-label": label,
        "aria-invalid": !!error,
        "aria-describedby": error ? errorId : undefined,
    };
    let control;
    switch (input.kind) {
        case "number":
        case "percent":
            control = (
                <div className="flex min-w-0 items-center gap-1">
                    <NumberStepper
                        {...accessibility}
                        value={value}
                        onChange={change}
                        min={input.min}
                        max={input.max}
                        step={
                            input.step ?? (input.kind === "percent" ? 0.1 : 1)
                        }
                        steppers={false}
                        disabled={blocked}
                    />
                    {input.kind === "percent" && (
                        <span
                            aria-hidden
                            className="text-xs text-muted-foreground"
                        >
                            %
                        </span>
                    )}
                </div>
            );
            break;
        case "currency":
            control = (
                <CurrencyField
                    {...accessibility}
                    value={value}
                    onChange={change}
                    min={input.min}
                    max={input.max}
                    disabled={blocked}
                />
            );
            break;
        case "date":
            control = (
                <DatePicker
                    {...accessibility}
                    value={value}
                    onChange={change}
                    onInvalidInput={change}
                    clearable={input.nullable !== false}
                    minDate={input.minDate}
                    maxDate={input.maxDate}
                    disabled={blocked}
                />
            );
            break;
        case "choice":
            control = (
                <ChoicePicker
                    {...accessibility}
                    value={value}
                    onChange={(next) =>
                        change(
                            typeof next === "number" || typeof next === "string"
                                ? next
                                : null,
                        )
                    }
                    options={input.options}
                    clearable={input.nullable !== false}
                    disabled={blocked}
                />
            );
            break;
        case "boolean":
            control = (
                <div className="flex items-center gap-2">
                    <Checkbox
                        {...accessibility}
                        checked={value === true}
                        indeterminate={value === null}
                        onCheckedChange={(checked) => change(checked)}
                        disabled={blocked}
                    />
                    <span className="text-xs text-muted-foreground">
                        {value === null
                            ? "Nicht gesetzt"
                            : value
                              ? "Ja"
                              : "Nein"}
                    </span>
                </div>
            );
            break;
        default:
            control = (
                <Input
                    {...accessibility}
                    value={value == null ? "" : String(value)}
                    onChange={(event) => change(event.target.value || null)}
                    disabled={blocked}
                />
            );
    }
    return (
        <div
            data-cell-interactive=""
            data-cell-mode={persistent ? "record" : "draft"}
            className="min-w-0 space-y-1"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
        >
            <div className="flex min-w-0 items-center gap-1">
                <div className="min-w-0 flex-1">{control}</div>
                {persistent && changed && (
                    <>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`${column.label} speichern`}
                            disabled={blocked || !!validation}
                            onClick={() => void commit()}
                        >
                            {busy ? (
                                <LoaderCircle className="size-3.5 animate-spin" />
                            ) : (
                                <Save className="size-3.5" />
                            )}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`${column.label} Änderung verwerfen`}
                            disabled={busy}
                            onClick={() => {
                                setLocal(undefined);
                                setFailure(undefined);
                            }}
                        >
                            <RotateCcw className="size-3.5" />
                        </Button>
                    </>
                )}
            </div>
            {error && (
                <p
                    role="alert"
                    id={errorId}
                    className="text-xs leading-4 text-destructive"
                >
                    {error}
                </p>
            )}
        </div>
    );
}
