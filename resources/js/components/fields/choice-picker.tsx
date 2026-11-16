import { ChoiceContent } from "./choice-content";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, ChevronsUpDown, Search, X } from "lucide-react";
import {
    useMemo,
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
    badgeTone?: "neutral" | "success" | "warning" | "danger";
    image?: string;
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
    /** One selection model for form inputs, toolbar menus and filter chips. */
    presentation?: "input" | "menu" | "chip";
    selectedDisplay?: "title" | "rich";
    triggerIcon?: ReactNode;
    iconOnly?: boolean;
    size?: "default" | "sm";
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
    presentation = "input",
    triggerIcon,
    iconOnly = false,
    selectedDisplay = "title",
    size = "default",
    ...aria
}: ChoicePickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [searching, setSearching] = useState(false);
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
    const richSelection =
        selectedDisplay === "rich" && !multiple ? selected[0] : undefined;
    const caption = selected.map((option) => option.label).join(", ");
    const triggerCaption =
        presentation === "chip" && multiple && ids.length > 1
            ? (selected[0]?.label ?? placeholder)
            : caption || placeholder;
    const updateQuery = (text: string) => {
        setQuery(text);
        onSearch?.(text);
    };
    // The selected label belongs to the field value, not to the transient
    // search query. Opening the menu must not turn it into an empty input.
    const matchingOptions = useMemo(() => {
        if (onSearch || !open || !query.trim()) return options;
        const term = query.toLocaleLowerCase("de");
        return options.filter((option) =>
            `${option.label} ${option.description ?? ""}`
                .toLocaleLowerCase("de")
                .includes(term),
        );
    }, [onSearch, open, options, query]);
    return (
        <Combobox.Root<ChoiceOption, boolean>
            items={options}
            filteredItems={visibleOptions ?? matchingOptions}
            filter={null}
            multiple={multiple}
            value={multiple ? selected : (selected[0] ?? null)}
            isItemEqualToValue={(a, b) => a.value === b.value}
            itemToStringLabel={(option) => option.label}
            itemToStringValue={(option) => String(option.value)}
            inputValue={
                presentation === "input"
                    ? !open || !searching
                        ? caption
                        : query
                    : query
            }
            onInputValueChange={(text, event) => {
                if (event.reason === "input-change") {
                    setSearching(true);
                    updateQuery(text);
                }
            }}
            onValueChange={(next, event) => {
                // Escape closes the surrounding surface; it must never erase a saved selection.
                if (event.reason === "escape-key") {
                    event.cancel();
                    event.allowPropagation();
                    return;
                }
                // Base UI can emit a null selection while editing the search
                // input. Only an explicit item choice or our clear button may
                // change the saved field value.
                if (!Array.isArray(next) && next == null) {
                    event.cancel();
                    return;
                }
                if (Array.isArray(next)) {
                    if (
                        ["input-change", "input-clear"].includes(event.reason)
                    ) {
                        event.cancel();
                        return;
                    }
                    if (maxSelected && next.length > maxSelected) {
                        event.cancel();
                        return;
                    }
                    onChange(next.map((option) => option.value));
                    setSearching(false);
                    updateQuery("");
                } else {
                    onChange(next.value);
                    setSearching(false);
                    updateQuery("");
                }
            }}
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                onOpenChange?.(next);
                if (!next) {
                    setSearching(false);
                    updateQuery("");
                }
            }}
            disabled={disabled}
            autoHighlight
        >
            {presentation !== "input" ? (
                <div
                    ref={anchor}
                    className={cn(
                        "inline-flex min-w-0 max-w-64 items-center",
                        presentation === "chip" && "max-w-full",
                    )}
                >
                    <Combobox.Trigger
                        id={id}
                        {...aria}
                        onBlur={onBlur}
                        render={
                            <Button
                                type="button"
                                variant={
                                    presentation === "chip"
                                        ? "ghost"
                                        : "outline"
                                }
                            />
                        }
                        title={caption || placeholder}
                        className={cn(
                            "h-(--control-height) min-w-0 max-w-full flex-1 shrink gap-2 text-xs/relaxed",
                            iconOnly && "size-(--control-height) flex-none px-0",
                            size === "sm" &&
                                "h-(--control-height-sm) gap-1.5 px-2 text-xs [&_svg]:size-3.5",
                            presentation === "chip" &&
                                "h-(--control-height) rounded-none border-0 px-2 shadow-none focus-visible:ring-2 focus-visible:ring-inset",
                        )}
                        onKeyDown={(event) => {
                            if (
                                event.key.length === 1 &&
                                event.key !== " " &&
                                !event.ctrlKey &&
                                !event.metaKey &&
                                !event.altKey
                            ) {
                                event.preventDefault();
                                setOpen(true);
                                onOpenChange?.(true);
                                updateQuery(event.key);
                            }
                        }}
                    >
                        {triggerIcon}
                        <span
                            className={cn(
                                "min-w-0 flex-1 truncate text-left",
                                iconOnly && "sr-only",
                            )}
                        >
                            {triggerCaption}
                        </span>
                        {multiple && ids.length > 1 && (
                            <span
                                data-slot="selection-count"
                                aria-label={`${ids.length} ausgewählt`}
                                className="shrink-0 rounded bg-muted px-1.5 text-[10px] leading-5 tabular-nums"
                            >
                                {presentation === "chip"
                                    ? `+${ids.length - 1}`
                                    : ids.length}
                            </span>
                        )}
                        {!iconOnly && (
                            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                    </Combobox.Trigger>
                    {clearable && ids.length > 0 && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Auswahl entfernen"
                            disabled={disabled}
                            onClick={() => {
                                onChange(multiple ? [] : null);
                                updateQuery("");
                            }}
                        >
                            <X />
                        </Button>
                    )}
                </div>
            ) : (
                <InputGroup
                    ref={anchor}
                    className={cn(
                        "relative min-w-0 bg-card",
                        selectedDisplay === "rich" && !multiple
                            ? "h-14"
                            : size === "sm"
                              ? "h-(--control-height-sm)"
                              : "h-(--control-height)",
                    )}
                >
                    {richSelection && !open && (
                        <span
                            data-slot="choice-selection"
                            aria-hidden="true"
                            className={cn(
                                "pointer-events-none absolute inset-y-0 left-3 flex min-w-0 items-center gap-2.5",
                                clearable ? "right-18" : "right-10",
                            )}
                        >
                            <ChoiceContent option={richSelection} />
                        </span>
                    )}
                    <Combobox.Input
                        render={<InputGroupInput />}
                        id={id}
                        ref={inputRef}
                        {...aria}
                        onBlur={onBlur}
                        placeholder={placeholder}
                        title={caption || undefined}
                        className={cn(
                            "min-w-0 flex-1 truncate",
                            richSelection &&
                                !open &&
                                "text-transparent caret-transparent",
                        )}
                        onFocus={(event) => event.currentTarget.select()}
                    />
                    <InputGroupAddon
                        align="inline-end"
                        className="shrink-0 gap-0"
                    >
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
                            tabIndex={-1}
                            aria-label="Auswahl öffnen"
                        >
                            <ChevronsUpDown />
                        </Combobox.Trigger>
                    </InputGroupAddon>
                </InputGroup>
            )}
            <Combobox.Portal>
                <Combobox.Positioner
                    anchor={anchor}
                    sideOffset={6}
                    align="start"
                    className="z-[100] outline-none"
                >
                    <Combobox.Popup className="w-[var(--anchor-width)] min-w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-closed:animate-out">
                        {presentation !== "input" && (
                            <div className="border-b p-2">
                                <InputGroup className="h-8 border-0 bg-transparent shadow-none ring-0">
                                    <InputGroupAddon>
                                        <Search className="size-4" />
                                    </InputGroupAddon>
                                    <Combobox.Input
                                        render={<InputGroupInput />}
                                        ref={inputRef}
                                        aria-label={`${aria["aria-label"] ?? placeholder} durchsuchen`}
                                        placeholder="Suchen …"
                                    />
                                </InputGroup>
                            </div>
                        )}
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
                                    <ChoiceContent option={option} />
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
