import { useEffect, useState, type ReactNode } from "react";
import { ListFilter, X, RotateCcw, Check } from "lucide-react";
import { ChoicePicker } from "@/components/fields/choice-picker";
import { RelationPicker } from "@/components/fields/entity-picker";
import { DatePicker } from "@/components/fields/pickers";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import {
    filterOperators,
    nullOperator,
    sanitizeGridFilters,
    type GridFilterDefinition,
    type GridFilters,
    type GridFilterOperator,
} from "./filter-rules";
const dateCaptions: Partial<Record<GridFilterOperator, string>> = {
    ">": "nach",
    ">=": "ab",
    "<": "vor",
    "<=": "bis",
};
const captions: Record<GridFilterOperator, string> = {
    in: "ist",
    "not in": "ist nicht",
    "=": "ist gleich",
    "!=": "ist nicht",
    contains: "enthält",
    "not contains": "enthält nicht",
    ">": "größer als",
    ">=": "mindestens",
    "<": "kleiner als",
    "<=": "höchstens",
    between: "zwischen",
    "is null": "ist leer",
    "is not null": "ist gefüllt",
};
export function ResourceFilters({
    definitions,
    value,
    onChange,
    renderToolbar,
}: {
    definitions: GridFilterDefinition[];
    value: GridFilters;
    onChange: (filters: GridFilters) => void;
    renderToolbar?: (trigger: ReactNode, activeFilters: ReactNode) => ReactNode;
}) {
    const [draft, setDraft] = useState<{
        field: string;
        operator: GridFilterOperator;
    } | null>(null);
    useEffect(() => {
        if (draft && value[draft.field]?.operator === draft.operator)
            setDraft(null);
    }, [draft, value]);
    const active = definitions.filter(
        (field) => value[field.field] || draft?.field === field.field,
    );
    const remove = (field: string) => {
        const next = { ...value };
        delete next[field];
        onChange(next);
        if (draft?.field === field) setDraft(null);
    };
    const trigger = (
        <ChoicePicker
            presentation="menu"
            triggerIcon={<ListFilter />}
            aria-label="Filter hinzufügen"
            placeholder="Filter"
            clearable={false}
            value={null}
            onChange={(field) =>
                setDraft({
                    field: String(field),
                    operator: filterOperators(
                        definitions.find((d) => d.field === field)!,
                    )[0],
                })
            }
            options={definitions.map((field) => ({
                value: field.field,
                label: field.label,
                disabled: !!value[field.field] || draft?.field === field.field,
            }))}
        />
    );
    const controls =
        active.length > 0 ? (
            <div
                data-slot="collection-active-filters"
                className="@container/filters flex min-w-0 max-w-full flex-wrap items-start gap-2 border-t pt-3"
                aria-label="Aktive Tabellenfilter"
            >
                {active.map((field) => {
                    const rule =
                        draft?.field === field.field &&
                        value[field.field]?.operator !== draft.operator
                            ? { operator: draft.operator, values: [] }
                            : (value[field.field] ?? {
                                  operator: filterOperators(field)[0],
                                  values: [],
                              });
                    const commit = (values: string[]) =>
                        onChange({
                            ...value,
                            [field.field]: { ...rule, values },
                        });
                    return (
                        <div
                            key={field.field}
                            data-slot="filter-chip"
                            role="group"
                            aria-label={`Filter ${field.label}`}
                            className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center rounded-lg border bg-card shadow-xs @min-[40rem]/filters:w-auto @min-[40rem]/filters:grid-cols-[auto_minmax(0,1fr)_auto]"
                        >
                            <div className="col-start-1 row-start-1 flex min-w-0 items-center">
                                <span
                                    title={field.label}
                                    className="max-w-48 truncate border-r px-2.5 text-xs font-medium"
                                >
                                    {field.label}
                                </span>
                                <ChoicePicker
                                    presentation="chip"
                                    aria-label={`${field.label} Operator`}
                                    clearable={false}
                                    value={rule.operator}
                                    options={filterOperators(field).map(
                                        (operator) => ({
                                            value: operator,
                                            label:
                                                field.kind === "date"
                                                    ? (dateCaptions[operator] ??
                                                      captions[operator])
                                                    : captions[operator],
                                        }),
                                    )}
                                    onChange={(valueOperator) => {
                                        const operator =
                                            valueOperator as GridFilterOperator;
                                        setDraft({
                                            field: field.field,
                                            operator,
                                        });
                                        const values =
                                            operator === "between"
                                                ? rule.values.length === 2
                                                    ? rule.values
                                                    : []
                                                : rule.values;
                                        onChange({
                                            ...value,
                                            [field.field]: {
                                                operator,
                                                values: nullOperator(operator)
                                                    ? []
                                                    : values,
                                            },
                                        });
                                    }}
                                />
                            </div>
                            {!nullOperator(rule.operator) && (
                                <div className="col-span-2 col-start-1 row-start-2 min-w-0 border-t @min-[40rem]/filters:col-span-1 @min-[40rem]/filters:col-start-2 @min-[40rem]/filters:row-start-1 @min-[40rem]/filters:border-l @min-[40rem]/filters:border-t-0">
                                    {field.kind === "relation" &&
                                    field.resource ? (
                                        <div className="flex min-w-0 @min-[40rem]/filters:max-w-52 [&>div]:w-full">
                                            <RelationPicker
                                                presentation="chip"
                                                aria-label={`${field.label} Werte`}
                                                placeholder="Auswählen …"
                                                resource={field.resource}
                                                labelField={field.labelField}
                                                filters={field.filters}
                                                creatable={false}
                                                multiple
                                                clearable={false}
                                                value={rule.values.map(Number)}
                                                onChange={(selected) => {
                                                    const values = (
                                                        selected as (
                                                            string | number
                                                        )[]
                                                    ).map(String);
                                                    if (values.length)
                                                        commit(values);
                                                    else remove(field.field);
                                                }}
                                            />
                                        </div>
                                    ) : !field.kind ||
                                      field.kind === "choice" ? (
                                        <ChoicePicker
                                            presentation="chip"
                                            aria-label={`${field.label} Werte`}
                                            placeholder="Wert wählen"
                                            clearable={false}
                                            multiple
                                            value={rule.values}
                                            options={field.options}
                                            onChange={(selected) => {
                                                const values =
                                                    selected as string[];
                                                if (values.length)
                                                    commit(values);
                                                else remove(field.field);
                                            }}
                                        />
                                    ) : (
                                        <ScalarFilterValue
                                            key={rule.operator}
                                            definition={field}
                                            operator={rule.operator}
                                            values={rule.values}
                                            onCommit={commit}
                                            onClear={() => remove(field.field)}
                                        />
                                    )}
                                </div>
                            )}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="col-start-2 row-start-1 mx-1 shrink-0 justify-self-end @min-[40rem]/filters:col-start-3"
                                aria-label={`${field.label} Filter entfernen`}
                                onClick={() => remove(field.field)}
                            >
                                <X />
                            </Button>
                        </div>
                    );
                })}
                {active.length > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-muted-foreground"
                        aria-label={`Alle ${active.length} Filter zurücksetzen`}
                        title={`Alle ${active.length} Filter zurücksetzen`}
                        onClick={() => {
                            const builderFields = new Set(
                                definitions.map((field) => field.field),
                            );
                            onChange(
                                Object.fromEntries(
                                    Object.entries(value).filter(
                                        ([field]) => !builderFields.has(field),
                                    ),
                                ),
                            );
                            setDraft(null);
                        }}
                    >
                        <RotateCcw /> Zurücksetzen
                    </Button>
                )}
            </div>
        ) : null;
    return renderToolbar ? (
        renderToolbar(trigger, controls)
    ) : (
        <div className="flex min-w-0 flex-col items-start gap-3">
            {trigger}
            {controls}
        </div>
    );
}
/** Editing a chip is local until Apply/Enter. Date ranges commit together. */
function ScalarFilterValue({
    definition,
    operator,
    values,
    onCommit,
    onClear,
}: {
    definition: GridFilterDefinition;
    operator: GridFilterOperator;
    values: string[];
    onCommit: (value: string[]) => void;
    onClear: () => void;
}) {
    const [draft, setDraft] = useState(values);
    const [error, setError] = useState(false);
    useEffect(() => {
        setDraft(values);
        setError(false);
    }, [JSON.stringify(values)]);
    const count = operator === "between" ? 2 : 1;
    const commit = () => {
        const normalized = Array.from({ length: count }, (_, index) =>
            definition.kind === "number"
                ? (draft[index] ?? "").trim().replace(",", ".")
                : (draft[index] ?? "").trim(),
        );
        if (normalized.every((v) => !v)) {
            onClear();
            return;
        }
        const valid = sanitizeGridFilters(
            { [definition.field]: { operator, values: normalized } },
            [definition],
        )[definition.field];
        if (!valid) {
            setError(true);
            return;
        }
        setError(false);
        onCommit(valid.values);
    };
    return (
        <div className="min-w-0 max-w-full">
            <div
                className="flex min-w-0 items-center"
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.defaultPrevented) {
                        event.preventDefault();
                        commit();
                    }
                }}
            >
                {Array.from({ length: count }, (_, index) =>
                    definition.kind === "date" ? (
                        <div
                            key={index}
                            className="min-w-0 flex-1 basis-36 p-0.5"
                        >
                            <DatePicker
                                aria-label={`${definition.label} ${count === 2 ? (index ? "Bis" : "Von") : "Wert"}`}
                                value={draft[index]}
                                onChange={(date) =>
                                    setDraft((previous) => {
                                        const next = [...previous];
                                        next[index] = date ?? "";
                                        return next;
                                    })
                                }
                                onInvalidInput={(text) =>
                                    setDraft((previous) => {
                                        const next = [...previous];
                                        next[index] = text;
                                        return next;
                                    })
                                }
                            />
                        </div>
                    ) : (
                        <InputGroup
                            key={index}
                            className="h-8 min-w-0 flex-1 basis-36 rounded-none border-0 shadow-none"
                        >
                            <InputGroupInput
                                aria-label={`${definition.label} ${count === 2 ? (index ? "Bis" : "Von") : "Wert"}`}
                                placeholder={
                                    count === 2
                                        ? index
                                            ? "Bis …"
                                            : "Von …"
                                        : "Wert eingeben …"
                                }
                                inputMode={
                                    definition.kind === "number"
                                        ? "decimal"
                                        : undefined
                                }
                                value={draft[index] ?? ""}
                                maxLength={200}
                                onChange={(event) =>
                                    setDraft((previous) => {
                                        const next = [...previous];
                                        next[index] = event.target.value;
                                        return next;
                                    })
                                }
                                className="h-full text-xs"
                            />
                        </InputGroup>
                    ),
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0"
                    aria-label={`${definition.label} Filter anwenden`}
                    onClick={commit}
                >
                    <Check />
                </Button>
            </div>
            {error && (
                <p role="alert" className="px-2 py-1 text-xs text-destructive">
                    {operator === "between"
                        ? "Gültigen Bereich von klein nach groß eingeben."
                        : "Gültigen Wert eingeben."}
                </p>
            )}
        </div>
    );
}
