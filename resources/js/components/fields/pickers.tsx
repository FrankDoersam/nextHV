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
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { format, parse, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import {
    useEffect,
    useId,
    useRef,
    useState,
    type AriaAttributes,
    type Ref,
} from "react";
export { RelationPicker } from "./entity-picker";
interface PickerValueProps extends AriaAttributes {
    id?: string;
    value: unknown;
    onChange: (value: string | null) => void;
    disabled?: boolean;
    clearable?: boolean;
    minDate?: string;
    maxDate?: string;
}
interface DatePickerProps extends PickerValueProps {
    inputRef?: Ref<HTMLInputElement>;
    onBlur?: () => void;
    /** RHF retains invalid drafts for its dirty guard and input validation. */
    onInvalidInput?: (draft: string) => void;
}
const parsedDate = (value: unknown) => {
    const parsed =
        typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)
            ? parseISO(value)
            : undefined;
    return parsed && isValid(parsed) ? parsed : undefined;
};
type DateConstraints = Pick<
    PickerValueProps,
    "clearable" | "minDate" | "maxDate"
>;
const invalidDateMessage =
    "Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.";

/** Control-level parsing constraints; business validation still runs on the API. */
export function dateControlError(
    value: unknown,
    { clearable = true, minDate, maxDate }: DateConstraints = {},
): string | undefined {
    if (value == null || value === "")
        return clearable ? undefined : "Bitte ein Datum eingeben.";
    const date =
        typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? parsedDate(value)
            : undefined;
    if (!date) return invalidDateMessage;
    const minimum = parsedDate(minDate),
        maximum = parsedDate(maxDate);
    if (minimum && String(value) < format(minimum, "yyyy-MM-dd"))
        return `Das Datum darf nicht vor dem ${format(minimum, "dd.MM.yyyy")} liegen.`;
    if (maximum && String(value) > format(maximum, "yyyy-MM-dd"))
        return `Das Datum darf nicht nach dem ${format(maximum, "dd.MM.yyyy")} liegen.`;
}
export function dateRangeControlError(
    value: unknown,
    constraints: DateConstraints = {},
): string | undefined {
    const range = (value ?? {}) as { from?: string; to?: string };
    return (
        dateControlError(range.from, constraints) ??
        dateControlError(range.to, constraints) ??
        (range.from && range.to && range.from > range.to
            ? "Das Ende darf nicht vor dem Beginn liegen."
            : undefined)
    );
}
function readDateInput(text: string): { value: string | null; error?: string } {
    if (!text.trim()) return { value: null };
    const date = /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(text.trim())
        ? parse(text.trim(), "d.M.yyyy", new Date())
        : undefined;
    return date && isValid(date)
        ? { value: format(date, "yyyy-MM-dd") }
        : { value: null, error: invalidDateMessage };
}
const dateCaption = (value: unknown) => {
    const date = parsedDate(value);
    return date ? format(date, "dd.MM.yyyy") : String(value ?? "");
};
export function DatePicker({
    id,
    value,
    onChange,
    disabled,
    clearable = true,
    minDate,
    maxDate,
    inputRef,
    onBlur,
    onInvalidInput,
    ...aria
}: DatePickerProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(() => dateCaption(value));
    const [touched, setTouched] = useState(false);
    const localRef = useRef<HTMLInputElement | null>(null);
    const errorId = useId();
    const caption = dateCaption(value);
    useEffect(() => setDraft(caption), [caption]);
    const selected = parsedDate(value);
    const minimum = parsedDate(minDate),
        maximum = parsedDate(maxDate);
    const parsed = readDateInput(draft);
    const error =
        parsed.error ??
        dateControlError(parsed.value, { clearable, minDate, maxDate });
    useEffect(() => {
        localRef.current?.setCustomValidity(error ?? "");
    }, [error]);
    const showError = touched && !!error && !aria["aria-invalid"];
    const commit = (text: string) => {
        setDraft(text);
        const next = readDateInput(text);
        const invalid =
            next.error ??
            dateControlError(next.value, { clearable, minDate, maxDate });
        if (invalid) onInvalidInput?.(next.error ? text : (next.value ?? ""));
        else onChange(next.value);
    };
    return (
        <div className="min-w-0">
            <Popover open={open} onOpenChange={setOpen}>
                <InputGroup className="h-9 bg-card">
                    <InputGroupInput
                        id={id}
                        {...aria}
                        ref={(element) => {
                            localRef.current = element;
                            if (typeof inputRef === "function")
                                inputRef(element);
                            else if (inputRef) inputRef.current = element;
                        }}
                        type="text"
                        value={draft}
                        placeholder="TT.MM.JJJJ"
                        autoComplete="off"
                        disabled={disabled}
                        aria-invalid={
                            aria["aria-invalid"] || (touched && !!error)
                        }
                        aria-describedby={
                            [
                                aria["aria-describedby"],
                                showError ? errorId : undefined,
                            ]
                                .filter(Boolean)
                                .join(" ") || undefined
                        }
                        onChange={(event) => commit(event.target.value)}
                        onBlur={() => {
                            setTouched(true);
                            if (!error && parsed.value)
                                setDraft(dateCaption(parsed.value));
                            onBlur?.();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && error) {
                                setTouched(true);
                                event.preventDefault();
                            }
                            if (event.altKey && event.key === "ArrowDown") {
                                event.preventDefault();
                                setOpen(true);
                            }
                        }}
                    />
                    <InputGroupAddon align="inline-end">
                        <PopoverTrigger
                            render={
                                <InputGroupButton
                                    aria-label="Kalender öffnen"
                                    size="icon-sm"
                                    disabled={disabled}
                                />
                            }
                        >
                            <CalendarIcon className="text-muted-foreground" />
                        </PopoverTrigger>
                    </InputGroupAddon>
                </InputGroup>
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
                            if (date || clearable) {
                                const next = date
                                    ? format(date, "yyyy-MM-dd")
                                    : null;
                                setDraft(dateCaption(next));
                                onChange(next);
                                onBlur?.();
                            }
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
                                setDraft("");
                                onBlur?.();
                                setOpen(false);
                            }}
                        >
                            Datum entfernen
                        </Button>
                    )}
                </PopoverContent>
            </Popover>
            {showError && (
                <p
                    id={errorId}
                    role="alert"
                    className="mt-2 text-xs leading-5 text-destructive"
                >
                    {error}
                </p>
            )}
        </div>
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
}: PickerValueProps) {
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
                        className="h-9 w-full justify-start bg-card font-normal"
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
    inputRef,
    onBlur,
    onInvalidInput,
    ...props
}: Omit<DatePickerProps, "onChange" | "onInvalidInput"> & {
    onChange: (value: unknown) => void;
    onInvalidInput?: (value: unknown) => void;
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
                    {...(!month
                        ? {
                              inputRef,
                              onBlur,
                              onInvalidInput: (from: string) =>
                                  onInvalidInput?.({ ...range, from }),
                          }
                        : {})}
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
                    {...(!month
                        ? {
                              onBlur,
                              onInvalidInput: (to: string) =>
                                  onInvalidInput?.({ ...range, to }),
                          }
                        : {})}
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
