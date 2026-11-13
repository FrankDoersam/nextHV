import {
    TimePicker,
    TimePickerColumns,
    TimePickerContent,
    TimePickerInput,
    TimePickerTrigger,
} from "@/components/reui/time-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState, type AriaAttributes } from "react";
export { RelationPicker } from "./entity-picker";
interface DatePickerProps extends AriaAttributes {
    id?: string;
    value: unknown;
    onChange: (value: string | null) => void;
    disabled?: boolean;
    clearable?: boolean;
    minDate?: string;
    maxDate?: string;
}
const parsedDate = (value: unknown) => {
    const parsed = value ? parseISO(String(value)) : undefined;
    return parsed && isValid(parsed) ? parsed : undefined;
};
export function DatePicker({
    id,
    value,
    onChange,
    disabled,
    clearable = true,
    minDate,
    maxDate,
    ...aria
}: DatePickerProps) {
    const [open, setOpen] = useState(false);
    const selected = parsedDate(value);
    const minimum = parsedDate(minDate),
        maximum = parsedDate(maxDate);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        id={id}
                        {...aria}
                        type="button"
                        variant="outline"
                        className="h-9 w-full justify-start bg-background font-normal"
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
                    required={!clearable}
                    disabled={[
                        ...(minimum ? [{ before: minimum }] : []),
                        ...(maximum ? [{ after: maximum }] : []),
                    ]}
                    onSelect={(date: Date | undefined) => {
                        if (date || clearable)
                            onChange(date ? format(date, "yyyy-MM-dd") : null);
                        setOpen(false);
                    }}
                    captionLayout="dropdown"
                    startMonth={minimum ?? new Date(1920, 0)}
                    endMonth={maximum ?? new Date(2100, 11)}
                    defaultMonth={selected ?? minimum}
                />
                {clearable && (
                    <Button
                        variant="ghost"
                        type="button"
                        disabled={!selected}
                        onClick={() => {
                            onChange(null);
                            setOpen(false);
                        }}
                    >
                        Datum entfernen
                    </Button>
                )}
            </PopoverContent>
        </Popover>
    );
}
export function MonthPicker({
    id,
    value,
    onChange,
    disabled,
    clearable = true,
    minDate,
    maxDate,
    ...aria
}: DatePickerProps) {
    const [open, setOpen] = useState(false);
    const [year, setYear] = useState(
        Number(String(value ?? "").slice(0, 4)) || new Date().getFullYear(),
    );
    const minimum = minDate?.slice(0, 7),
        maximum = maxDate?.slice(0, 7);
    const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value));
    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next)
                    setYear(
                        Number(String(value ?? minDate ?? "").slice(0, 4)) ||
                            new Date().getFullYear(),
                    );
            }}
        >
            <PopoverTrigger
                render={
                    <Button
                        id={id}
                        {...aria}
                        disabled={disabled}
                        type="button"
                        variant="outline"
                        className="h-9 w-full justify-start bg-background font-normal"
                    />
                }
            >
                <CalendarIcon />
                {valid
                    ? format(parseISO(String(value) + "-01"), "MMMM yyyy", {
                          locale: de,
                      })
                    : "Monat wählen"}
            </PopoverTrigger>
            <PopoverContent>
                <Input
                    type="number"
                    aria-label="Jahr"
                    min={Number(minimum?.slice(0, 4)) || 1900}
                    max={Number(maximum?.slice(0, 4)) || 2100}
                    value={year}
                    onChange={(event) => setYear(Number(event.target.value))}
                />
                <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 12 }, (_, month) => {
                        const key = `${year}-${String(month + 1).padStart(2, "0")}`;
                        return (
                            <Button
                                type="button"
                                key={month}
                                variant={value === key ? "secondary" : "ghost"}
                                aria-pressed={value === key}
                                disabled={
                                    !Number.isInteger(year) ||
                                    year < 1900 ||
                                    year > 2100 ||
                                    !!(minimum && key < minimum) ||
                                    !!(maximum && key > maximum)
                                }
                                onClick={() => {
                                    onChange(key);
                                    setOpen(false);
                                }}
                            >
                                {format(new Date(2000, month, 1), "MMM", {
                                    locale: de,
                                })}
                            </Button>
                        );
                    })}
                </div>
                {clearable && (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={!value}
                        onClick={() => {
                            onChange(null);
                            setOpen(false);
                        }}
                    >
                        Entfernen
                    </Button>
                )}
            </PopoverContent>
        </Popover>
    );
}
export function RangePicker({
    id,
    value,
    onChange,
    month = false,
    minDate,
    maxDate,
    ...props
}: Omit<DatePickerProps, "onChange"> & {
    onChange: (value: unknown) => void;
    month?: boolean;
}) {
    const range = (value ?? {}) as { from?: string; to?: string };
    const Picker = month ? MonthPicker : DatePicker;
    return (
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label
                    htmlFor={id}
                    className="mb-1 block text-xs text-muted-foreground"
                >
                    Von
                </label>
                <Picker
                    {...props}
                    id={id}
                    value={range.from}
                    minDate={minDate}
                    maxDate={
                        range.to && (!maxDate || range.to < maxDate)
                            ? range.to
                            : maxDate
                    }
                    onChange={(from) => onChange({ ...range, from })}
                />
            </div>
            <div>
                <label
                    htmlFor={`${id}-to`}
                    className="mb-1 block text-xs text-muted-foreground"
                >
                    Bis
                </label>
                <Picker
                    {...props}
                    id={`${id}-to`}
                    value={range.to}
                    maxDate={maxDate}
                    minDate={
                        range.from && (!minDate || range.from > minDate)
                            ? range.from
                            : minDate
                    }
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
    disabled,
    ...aria
}: {
    id?: string;
    value: unknown;
    onChange: (value: string | null) => void;
    disabled?: boolean;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
}) {
    return (
        <TimePicker
            id={id}
            value={value ? String(value) : null}
            onValueChange={onChange}
            hourCycle={24}
            disabled={disabled}
        >
            <div className="flex gap-2">
                <TimePickerInput {...aria} />
                <TimePickerTrigger />
            </div>
            <TimePickerContent>
                <TimePickerColumns />
            </TimePickerContent>
        </TimePicker>
    );
}
