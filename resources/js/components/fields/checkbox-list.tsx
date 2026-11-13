import { useId, useState, type AriaAttributes } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChoiceOption } from "./choice-picker";

/** Small business option sets: list, cards, search and scoped select-all. */
export function CheckboxList({
    id,
    options = [],
    value,
    onChange,
    disabled,
    layout = "list",
    searchable = false,
    selectAll = false,
    maxSelected,
    ...aria
}: AriaAttributes & {
    id?: string;
    options?: ChoiceOption[];
    value: unknown;
    onChange: (value: unknown) => void;
    disabled?: boolean;
    layout?: "list" | "cards";
    searchable?: boolean;
    selectAll?: boolean;
    maxSelected?: number;
}) {
    const generated = useId();
    const base = id ?? generated;
    const [query, setQuery] = useState("");
    const selected: (string | number)[] = Array.isArray(value) ? value : [];
    const visible = options.filter((o) =>
        `${o.label} ${o.description ?? ""}`
            .toLocaleLowerCase("de")
            .includes(query.toLocaleLowerCase("de")),
    );
    const enabled = visible.filter((o) => !o.disabled);
    const checked =
        enabled.length > 0 && enabled.every((o) => selected.includes(o.value));
    const toggle = (option: ChoiceOption, next: boolean) => {
        if (disabled || option.disabled) return;
        if (next && maxSelected && selected.length >= maxSelected) return;
        onChange(
            next
                ? [...new Set([...selected, option.value])]
                : selected.filter((id) => id !== option.value),
        );
    };
    return (
        <div id={base} role="group" {...aria} className="min-w-0 space-y-3">
            {searchable && (
                <Input
                    aria-label="Optionen durchsuchen"
                    placeholder="Optionen suchen …"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    disabled={disabled}
                />
            )}
            {selectAll && (
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                        checked={checked}
                        indeterminate={
                            !checked &&
                            enabled.some((o) => selected.includes(o.value))
                        }
                        disabled={disabled || !enabled.length}
                        onCheckedChange={(next) => {
                            if (!next)
                                onChange(
                                    selected.filter(
                                        (id) =>
                                            !enabled.some(
                                                (o) => o.value === id,
                                            ),
                                    ),
                                );
                            else {
                                const all = [
                                    ...new Set([
                                        ...selected,
                                        ...enabled.map((o) => o.value),
                                    ]),
                                ];
                                onChange(
                                    maxSelected
                                        ? all.slice(0, maxSelected)
                                        : all,
                                );
                            }
                        }}
                    />
                    Alle sichtbaren auswählen
                </label>
            )}
            <div
                className={cn(
                    "grid gap-2",
                    layout === "cards" && "sm:grid-cols-2",
                )}
            >
                {visible.map((option, index) => {
                    const active = selected.includes(option.value);
                    const locked =
                        disabled ||
                        option.disabled ||
                        (!active &&
                            !!maxSelected &&
                            selected.length >= maxSelected);
                    return (
                        <label
                            key={option.value}
                            htmlFor={`${base}-${index}`}
                            className={cn(
                                "flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                                active
                                    ? "border-primary/40 bg-primary/5"
                                    : "bg-background hover:bg-muted/50",
                                locked && "cursor-not-allowed opacity-50",
                            )}
                        >
                            <Checkbox
                                id={`${base}-${index}`}
                                checked={active}
                                disabled={locked}
                                onCheckedChange={(next) => toggle(option, next)}
                            />
                            {option.icon && (
                                <span className="shrink-0 text-muted-foreground [&>svg]:size-5">
                                    {option.icon}
                                </span>
                            )}
                            <span className="min-w-0 flex-1">
                                <span className="block font-medium">
                                    {option.label}
                                </span>
                                {option.description && (
                                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                        {option.description}
                                    </span>
                                )}
                            </span>
                            {option.badge && (
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
                                    {option.badge}
                                </span>
                            )}
                        </label>
                    );
                })}
            </div>
            {!visible.length && (
                <p className="text-sm text-muted-foreground">
                    Keine passenden Optionen.
                </p>
            )}
            <p aria-live="polite" className="text-xs text-muted-foreground">
                {selected.length} ausgewählt
                {maxSelected ? ` · maximal ${maxSelected}` : ""}
            </p>
        </div>
    );
}
