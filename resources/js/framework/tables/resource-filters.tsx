import { useEffect, useState, type ReactNode } from "react";
import { ListFilter, X } from "lucide-react";
import { ChoicePicker } from "@/components/fields/choice-picker";
import { Button } from "@/components/ui/button";
import type {
    GridFilterDefinition,
    GridFilters,
    GridFilterOperator,
} from "./filter-rules";

const operators = [
    { value: "in", label: "ist" },
    { value: "not in", label: "ist nicht" },
];

/** Declarative faceted filter builder, shared by full grids and embedded relations. */
export function ResourceFilters({
    definitions,
    value,
    onChange,
    renderToolbar,
}: {
    definitions: GridFilterDefinition[];
    value: GridFilters;
    onChange: (filters: GridFilters) => void;
    renderToolbar?: (trigger: ReactNode) => ReactNode;
}) {
    const [draft, setDraft] = useState<{
        field: string;
        operator: GridFilterOperator;
    } | null>(null);
    // URL navigation commits asynchronously: retain the draft until its rule is reflected.
    // Otherwise the first selection unmounts the popup before a second value can be chosen.
    useEffect(() => {
        if (draft && value[draft.field]) setDraft(null);
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
                setDraft({ field: String(field), operator: "in" })
            }
            options={definitions.map((field) => ({
                value: field.field,
                label: field.label,
                disabled: !!value[field.field] || draft?.field === field.field,
            }))}
        />
    );
    const controls = (
        <div
            className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
            aria-label="Tabellenfilter"
        >
            {trigger}
            {active.map((field) => {
                const rule = value[field.field] ?? {
                    operator: draft?.operator ?? "in",
                    values: [],
                };
                return (
                    <div
                        key={field.field}
                        data-slot="filter-chip"
                        role="group"
                        aria-label={`Filter ${field.label}`}
                        className="inline-flex min-w-0 max-w-full items-center overflow-hidden rounded-lg border bg-card shadow-xs"
                    >
                        <span className="shrink-0 border-r px-2.5 text-xs font-medium">
                            {field.label}
                        </span>
                        <ChoicePicker
                            presentation="chip"
                            aria-label={`${field.label} Operator`}
                            clearable={false}
                            value={rule.operator}
                            options={operators}
                            onChange={(operator) => {
                                if (rule.values.length)
                                    onChange({
                                        ...value,
                                        [field.field]: {
                                            ...rule,
                                            operator:
                                                operator as GridFilterOperator,
                                        },
                                    });
                                else
                                    setDraft({
                                        field: field.field,
                                        operator:
                                            operator as GridFilterOperator,
                                    });
                            }}
                        />
                        <span className="h-4 border-l" aria-hidden />
                        <ChoicePicker
                            presentation="chip"
                            aria-label={`${field.label} Werte`}
                            placeholder="Wert wählen"
                            clearable={false}
                            multiple
                            value={rule.values}
                            options={field.options}
                            onChange={(selected) => {
                                const values = selected as string[];
                                if (values.length) {
                                    onChange({
                                        ...value,
                                        [field.field]: { ...rule, values },
                                    });
                                } else remove(field.field);
                            }}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="mr-1 shrink-0"
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
                    className="px-2 text-muted-foreground"
                    onClick={() => {
                        onChange({});
                        setDraft(null);
                    }}
                >
                    Zurücksetzen
                </Button>
            )}
        </div>
    );
    return renderToolbar ? renderToolbar(controls) : controls;
}
