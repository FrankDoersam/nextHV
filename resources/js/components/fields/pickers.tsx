import {
    TimePicker,
    TimePickerColumns,
    TimePickerContent,
    TimePickerInput,
    TimePickerTrigger,
} from "@/components/reui/time-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    useDebounced,
    useResource,
    useResourceList,
} from "@/framework/data/hooks";
import type { Filter } from "@/framework/types";
import { useWorkbench } from "@/framework/workbench";
import { getResource } from "@/modules/registry";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
export function RelationPicker({
    id,
    resource: resourceName,
    value,
    onChange,
    labelField,
    filters,
    disabled,
}: {
    id?: string;
    resource: string;
    value: unknown;
    onChange: (value: number | null) => void;
    labelField?: string;
    filters?: Filter[];
    disabled?: boolean;
}) {
    const resource = getResource(resourceName);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const query = useDebounced(search);
    const selected = useResource(resource, Number(value) || 0);
    const result = useResourceList(
        resource,
        { query, limit: 10, filters },
        open,
    );
    const workbench = useWorkbench();
    const titleField = labelField ?? resource.titleField;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between font-normal"
                    />
                }
            >
                {value
                    ? selected.data
                        ? String(selected.data[titleField])
                        : "Wird geladen …"
                    : "Suchen und auswählen …"}
                <ChevronsUpDown className="ml-2 size-4 opacity-50" />
            </PopoverTrigger>
            <PopoverContent
                className="w-[min(360px,calc(100vw-2rem))] p-0"
                align="start"
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={`${resource.label} suchen …`}
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList>
                        {result.isFetching ? (
                            <p className="p-3 text-xs text-muted-foreground">
                                Wird gesucht …
                            </p>
                        ) : result.isError ? (
                            <p
                                role="alert"
                                className="p-3 text-xs text-destructive"
                            >
                                Suche fehlgeschlagen. Bitte erneut versuchen.
                            </p>
                        ) : (
                            <CommandEmpty>Keine Ergebnisse</CommandEmpty>
                        )}
                        {result.data?.data.map((row) => (
                            <CommandItem
                                key={row.id}
                                value={String(row.id)}
                                onSelect={() => {
                                    onChange(row.id);
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    className={
                                        Number(value) === row.id
                                            ? "opacity-100"
                                            : "opacity-0"
                                    }
                                />
                                <span>{String(row[titleField])}</span>
                                {!!row.code && (
                                    <span className="ml-auto text-xs text-muted-foreground">
                                        {String(row.code)}
                                    </span>
                                )}
                            </CommandItem>
                        ))}
                    </CommandList>
                    <div className="flex gap-2 border-t p-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                setOpen(false);
                                workbench.openForm({
                                    resource,
                                    mode: "create",
                                    reduced: true,
                                    presentation: "dialog",
                                    onSaved: (row) => onChange(row.id),
                                });
                            }}
                        >
                            <Plus />
                            {resource.singular} anlegen
                        </Button>
                        {!!value && (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    onChange(null);
                                    setOpen(false);
                                }}
                            >
                                Leeren
                            </Button>
                        )}
                    </div>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
export function DatePicker({
    id,
    value,
    onChange,
    disabled,
}: {
    id?: string;
    value: unknown;
    onChange: (value: string | null) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const selected = value ? parseISO(String(value)) : undefined;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        className="w-full justify-start font-normal"
                        disabled={disabled}
                    />
                }
            >
                <CalendarIcon className="text-muted-foreground" />
                {selected ? format(selected, "dd.MM.yyyy") : "Datum wählen"}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    locale={de}
                    selected={selected}
                    onSelect={(d) => {
                        onChange(d ? format(d, "yyyy-MM-dd") : null);
                        setOpen(false);
                    }}
                    captionLayout="dropdown"
                    startMonth={new Date(1920, 0)}
                    endMonth={new Date(2100, 11)}
                    defaultMonth={selected}
                />
                <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                        onChange(null);
                        setOpen(false);
                    }}
                >
                    Datum entfernen
                </Button>
            </PopoverContent>
        </Popover>
    );
}
export function MonthPicker({
    id,
    value,
    onChange,
}: {
    id?: string;
    value: unknown;
    onChange: (value: string | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const [year, setYear] = useState(
        Number(String(value ?? "").slice(0, 4)) || new Date().getFullYear(),
    );
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        className="w-full justify-start font-normal"
                    />
                }
            >
                <CalendarIcon />
                {value
                    ? format(parseISO(String(value) + "-01"), "MMMM yyyy", {
                          locale: de,
                      })
                    : "Monat wählen"}
            </PopoverTrigger>
            <PopoverContent>
                <Input
                    type="number"
                    aria-label="Jahr"
                    min={1900}
                    max={2100}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                />
                <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 12 }, (_, m) => (
                        <Button
                            type="button"
                            key={m}
                            variant="ghost"
                            onClick={() => {
                                onChange(
                                    `${year}-${String(m + 1).padStart(2, "0")}`,
                                );
                                setOpen(false);
                            }}
                        >
                            {format(new Date(year, m, 1), "MMM", {
                                locale: de,
                            })}
                        </Button>
                    ))}
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                        onChange(null);
                        setOpen(false);
                    }}
                >
                    Entfernen
                </Button>
            </PopoverContent>
        </Popover>
    );
}
export function RangePicker({
    id,
    value,
    onChange,
    month = false,
}: {
    id?: string;
    value: unknown;
    onChange: (value: unknown) => void;
    month?: boolean;
}) {
    const range = (value ?? {}) as { from?: string; to?: string };
    const Picker = month ? MonthPicker : DatePicker;
    return (
        <div className="grid grid-cols-2 gap-3">
            <div>
                <span className="mb-1 block text-xs text-muted-foreground">
                    Von
                </span>
                <Picker
                    id={id}
                    value={range.from}
                    onChange={(from) => onChange({ ...range, from })}
                />
            </div>
            <div>
                <span className="mb-1 block text-xs text-muted-foreground">
                    Bis
                </span>
                <Picker
                    value={range.to}
                    onChange={(to) => onChange({ ...range, to })}
                />
            </div>
        </div>
    );
}
export function TimeField({
    id,
    value,
    onChange,
}: {
    id?: string;
    value: unknown;
    onChange: (value: string | null) => void;
}) {
    return (
        <TimePicker
            id={id}
            value={value ? String(value) : null}
            onValueChange={onChange}
            hourCycle={24}
        >
            <div className="flex gap-2">
                <TimePickerInput />
                <TimePickerTrigger />
            </div>
            <TimePickerContent>
                <TimePickerColumns />
            </TimePickerContent>
        </TimePicker>
    );
}
