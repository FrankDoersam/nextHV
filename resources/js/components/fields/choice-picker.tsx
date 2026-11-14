import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, X } from "lucide-react";
import {
    useRef,
    useState,
    type AriaAttributes,
    type ReactNode,
    type Ref,
} from "react";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ChoiceOption {
    value: string | number;
    label: string;
    description?: string;
    icon?: ReactNode;
    badge?: string;
    disabled?: boolean;
}
export interface ChoicePickerProps extends AriaAttributes {
    id?: string;
    value: unknown;
    onChange: (value: unknown) => void;
    options?: ChoiceOption[];
    visibleOptions?: ChoiceOption[];
    multiple?: boolean;
    clearable?: boolean;
    disabled?: boolean;
    placeholder?: string;
    onBlur?: () => void;
    inputRef?: Ref<HTMLInputElement>;
    onSearch?: (query: string) => void;
    onOpenChange?: (open: boolean) => void;
    loading?: boolean;
    error?: string;
    footer?: ReactNode;
    maxSelected?: number;
}

/** Searchable input, shared by enums and asynchronous entity selections. */
export function ChoicePicker({
    id,
    value,
    onChange,
    options = [],
    visibleOptions,
    multiple = false,
    clearable = true,
    disabled,
    placeholder = "Suchen und auswählen …",
    onBlur,
    inputRef,
    onSearch,
    onOpenChange,
    loading,
    error,
    footer,
    maxSelected,
    ...aria
}: ChoicePickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const anchor = useRef<HTMLDivElement>(null);
    const ids = multiple
        ? Array.isArray(value)
            ? value
            : []
        : value == null || value === ""
          ? []
          : [value];
    const selected = ids
        .map((id) => options.find((option) => option.value === id))
        .filter((o): o is ChoiceOption => !!o);
    const caption = selected.map((option) => option.label).join(", ");
    const updateQuery = (text: string) => {
        setQuery(text);
        onSearch?.(text);
    };
    return (
        <Combobox.Root<ChoiceOption, boolean>
            items={options}
            filteredItems={visibleOptions ?? (onSearch ? options : undefined)}
            filter={
                onSearch
                    ? null
                    : (item, search) =>
                          `${item.label} ${item.description ?? ""}`
                              .toLocaleLowerCase("de")
                              .includes(search.toLocaleLowerCase("de"))
            }
            multiple={multiple}
            value={multiple ? selected : (selected[0] ?? null)}
            isItemEqualToValue={(a, b) => a.value === b.value}
            itemToStringLabel={(option) => option.label}
            itemToStringValue={(option) => String(option.value)}
            inputValue={open ? query : caption}
            onInputValueChange={(text, event) => {
                if (event.reason === "input-change") updateQuery(text);
            }}
            onValueChange={(next, event) => {
                // Escape closes the surrounding surface; it must never erase a saved selection.
                if (event.reason === "escape-key") {
                    event.cancel();
                    event.allowPropagation();
                    return;
                }
                if (Array.isArray(next)) {
                    if (maxSelected && next.length > maxSelected) {
                        event.cancel();
                        return;
                    }
                    onChange(next.map((option) => option.value));
                    updateQuery("");
                } else if (next || clearable) onChange(next?.value ?? null);
                else event.cancel();
            }}
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                onOpenChange?.(next);
                if (!next) updateQuery("");
            }}
            disabled={disabled}
            autoHighlight
        >
            <InputGroup ref={anchor} className="h-9 min-w-0 bg-card">
                <Combobox.Input
                    render={<InputGroupInput />}
                    id={id}
                    ref={inputRef}
                    {...aria}
                    onBlur={onBlur}
                    placeholder={placeholder}
                    title={caption || undefined}
                    className="min-w-0 flex-1 truncate"
                    onFocus={(event) => event.currentTarget.select()}
                />
                <InputGroupAddon align="inline-end" className="shrink-0 gap-0">
                    {clearable && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Auswahl entfernen"
                            disabled={disabled}
                            tabIndex={ids.length ? 0 : -1}
                            aria-hidden={!ids.length}
                            className={cn(!ids.length && "invisible")}
                            onClick={() => {
                                onChange(multiple ? [] : null);
                                updateQuery("");
                            }}
                        >
                            <X />
                        </Button>
                    )}
                    <Combobox.Trigger
                        render={
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                            />
                        }
                        aria-label="Auswahl öffnen"
                    >
                        <ChevronsUpDown />
                    </Combobox.Trigger>
                </InputGroupAddon>
            </InputGroup>
            <Combobox.Portal>
                <Combobox.Positioner
                    anchor={anchor}
                    sideOffset={6}
                    className="z-[100] outline-none"
                >
                    <Combobox.Popup className="w-[var(--anchor-width)] min-w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-closed:animate-out">
                        {error ? (
                            <p
                                role="alert"
                                className="p-3 text-xs text-destructive"
                            >
                                {error}
                            </p>
                        ) : (
                            loading && (
                                <p
                                    role="status"
                                    className="p-3 text-xs text-muted-foreground"
                                >
                                    Wird gesucht …
                                </p>
                            )
                        )}
                        <Combobox.List
                            className="max-h-64 scroll-py-1 overflow-y-auto overscroll-contain p-1"
                            aria-busy={loading}
                        >
                            {(option: ChoiceOption) => (
                                <Combobox.Item
                                    key={option.value}
                                    value={option}
                                    disabled={
                                        option.disabled ||
                                        !!loading ||
                                        (multiple &&
                                            !!maxSelected &&
                                            ids.length >= maxSelected &&
                                            !ids.includes(option.value))
                                    }
                                    className="relative flex cursor-default items-center gap-2 rounded-md py-2 pr-8 pl-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
                                >
                                    {option.icon && (
                                        <span className="shrink-0 [&>svg]:size-4">
                                            {option.icon}
                                        </span>
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate">
                                            {option.label}
                                        </span>
                                        {option.description && (
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {option.description}
                                            </span>
                                        )}
                                    </span>
                                    {option.badge && (
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            {option.badge}
                                        </span>
                                    )}
                                    <Combobox.ItemIndicator className="absolute right-2">
                                        <Check className="size-4" />
                                    </Combobox.ItemIndicator>
                                </Combobox.Item>
                            )}
                        </Combobox.List>
                        {!loading && !error && (
                            <Combobox.Empty className="p-3 text-xs text-muted-foreground empty:hidden">
                                Keine Ergebnisse
                            </Combobox.Empty>
                        )}
                        {(footer || (multiple && !!maxSelected)) && (
                            <div className="border-t p-2">
                                {footer}
                                {multiple && maxSelected && (
                                    <p className="px-1 text-xs text-muted-foreground">
                                        {ids.length} von maximal {maxSelected}{" "}
                                        ausgewählt
                                    </p>
                                )}
                            </div>
                        )}
                    </Combobox.Popup>
                </Combobox.Positioner>
            </Combobox.Portal>
        </Combobox.Root>
    );
}
