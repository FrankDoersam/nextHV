import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandItem,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
export function MultiSelect({
    id,
    options = [],
    value,
    onChange,
    disabled,
    checkboxes = false,
    ...aria
}: {
    id: string;
    options?: { value: string; label: string }[];
    value: unknown;
    onChange: (value: string[]) => void;
    disabled?: boolean;
    checkboxes?: boolean;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
}) {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (key: string) =>
        onChange(
            selected.includes(key)
                ? selected.filter((v) => v !== key)
                : [...selected, key],
        );
    if (checkboxes)
        return (
            <div
                id={id}
                role="group"
                {...aria}
                className="grid gap-3 rounded-lg border p-3"
            >
                {options.map((o) => (
                    <label
                        key={o.value}
                        className="flex items-center gap-2 text-sm"
                    >
                        <Checkbox
                            checked={selected.includes(o.value)}
                            disabled={disabled}
                            onCheckedChange={() => toggle(o.value)}
                        />
                        {o.label}
                    </label>
                ))}
            </div>
        );
    return (
        <Popover>
            <PopoverTrigger
                render={
                    <Button
                        id={id}
                        {...aria}
                        disabled={disabled}
                        type="button"
                        variant="outline"
                        role="combobox"
                        className="h-auto min-h-9 w-full justify-between text-left font-normal"
                    />
                }
            >
                <span className="truncate">
                    {selected.length
                        ? options
                              .filter((o) => selected.includes(o.value))
                              .map((o) => o.label)
                              .join(", ")
                        : "Mehrere auswählen …"}
                </span>
                <ChevronsUpDown className="shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-[var(--anchor-width)] p-0"
            >
                <Command>
                    <CommandInput placeholder="Option suchen …" />
                    <CommandList>
                        <CommandEmpty>Keine passende Option</CommandEmpty>
                        {options.map((o) => (
                            <CommandItem
                                key={o.value}
                                value={o.label}
                                onSelect={() => toggle(o.value)}
                            >
                                <Check
                                    className={
                                        selected.includes(o.value)
                                            ? "opacity-100"
                                            : "opacity-0"
                                    }
                                />
                                {o.label}
                            </CommandItem>
                        ))}
                    </CommandList>
                    <div className="flex items-center justify-between border-t p-2 text-xs text-muted-foreground">
                        <span>{selected.length} ausgewählt</span>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onChange([])}
                        >
                            Leeren
                        </Button>
                    </div>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
