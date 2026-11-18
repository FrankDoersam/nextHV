import {
    PersonAvatar,
    PeopleGroup,
    type AvatarPerson,
} from "@/components/blocks/people-avatar";
import { StatusBadge } from "@/components/blocks/content";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type {
    CellDraftValues,
    CellTone,
    ColumnDefinition,
    RecordData,
} from "../types";
import { cellItems, cellText, recordValue, optionLabel } from "./cell-value";
import {
    cellNumber,
    evaluateColumn,
    evaluateExpression,
    resolveCellColor,
} from "./column-calculations";
import { useI18n } from "../i18n";

const toneClasses: Record<CellTone, string> = {
    neutral: "bg-muted/50 text-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-destructive",
    info: "bg-info/10 text-info",
};

interface CellRendererProps {
    column: ColumnDefinition;
    row: RecordData;
    columns?: readonly ColumnDefinition[];
    draft?: CellDraftValues;
}

export function CellRenderer({
    column,
    row,
    columns = [],
    draft = {},
}: CellRendererProps) {
    const color = resolveCellColor(column, row, columns, draft);
    const content = (
        <CellContent
            column={column}
            row={row}
            columns={columns}
            draft={draft}
        />
    );
    return color ? (
        <div
            data-cell-tone={color.tone}
            className={cn(
                "min-w-0 rounded-md px-2 py-1",
                toneClasses[color.tone],
            )}
        >
            {content}
            {color.label && (
                <span className="block text-[11px] leading-4">
                    {color.label}
                </span>
            )}
        </div>
    ) : (
        content
    );
}

function CellContent({
    column,
    row,
    columns = [],
    draft = {},
}: CellRendererProps) {
    const { date, money, number } = useI18n();
    if (column.render) return column.render(row);
    const value = evaluateColumn(row, column, columns, draft);
    const formatted = (entry: unknown): string => {
        if (entry == null || entry === "") return "—";
        if (column.kind === "currency")
            return cellNumber(entry) === null ? "—" : money(entry);
        if (column.kind === "number")
            return cellNumber(entry) === null ? "—" : number(entry, 2);
        if (column.kind === "percent")
            return cellNumber(entry) === null ? "—" : `${number(entry, 2)} %`;
        if (column.kind === "date") return date(entry);
        if (column.kind === "boolean")
            return entry === true ? "Ja" : entry === false ? "Nein" : "—";
        return String(entry);
    };
    const cell = column.cell;
    if (cell?.type === "ratio") {
        const ratio = cellNumber(value);
        if (ratio === null) return <span>—</span>;
        const precision = Number.isInteger(cell.precision)
            ? Math.min(8, Math.max(0, cell.precision!))
            : 1;
        const caption = `${number(ratio, precision)}×`;
        const target = cell.target
            ? cellNumber(evaluateExpression(cell.target, row, columns, draft))
            : null;
        return (
            <div className="min-w-0 space-y-1">
                <span className="block font-medium tabular-nums">
                    {caption}
                </span>
                {target !== null && target > 0 && (
                    <Progress
                        value={Math.min(
                            100,
                            Math.max(0, (ratio / target) * 100),
                        )}
                        aria-label={column.label}
                        aria-valuetext={`${caption} von Ziel ${number(target, precision)}×`}
                        className="gap-0"
                    />
                )}
            </div>
        );
    }
    if (cell?.type === "boolean" || column.kind === "boolean")
        return (
            <span>
                {value === true ? "Ja" : value === false ? "Nein" : "—"}
            </span>
        );
    if (cell?.type === "sparkline") {
        const source = cell.series ? recordValue(row, cell.series) : value;
        const samples = Array.isArray(source)
            ? source.slice(-32).map(cellNumber)
            : [];
        if (samples.length < 2 || samples.some((sample) => sample === null))
            return <span>—</span>;
        const numbers = samples as number[];
        const minimum = Math.min(...numbers),
            range = Math.max(...numbers) - minimum;
        const points = numbers
            .map(
                (sample, index) =>
                    `${2 + (index * 92) / (numbers.length - 1)},${range ? 26 - ((sample - minimum) / range) * 24 : 14}`,
            )
            .join(" ");
        const caption = `${column.label}: ${number(numbers[0], 2)} → ${number(numbers.at(-1), 2)}`;
        return (
            <svg
                role="img"
                aria-label={caption}
                viewBox="0 0 96 28"
                className="h-7 w-24 max-w-full text-primary"
            >
                <title>{caption}</title>
                <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        );
    }
    if (
        cell?.type === "progress" ||
        cell?.type === "delta" ||
        cell?.type === "comparison"
    ) {
        const actual = cellNumber(value);
        const target = cell.target
            ? cellNumber(evaluateExpression(cell.target, row, columns, draft))
            : null;
        if (actual === null || target === null) return <span>—</span>;
        const delta =
            cell.deltaMode === "percent"
                ? target === 0
                    ? null
                    : ((actual - target) / Math.abs(target)) * 100
                : actual - target;
        const positive = (delta ?? 0) > 0;
        const good = cell.positive === "bad" ? !positive : positive;
        const tone: CellTone =
            delta == null || delta === 0
                ? "neutral"
                : good
                  ? "success"
                  : "danger";
        const DeltaIcon =
            delta === 0 || delta == null
                ? Minus
                : positive
                  ? ArrowUpRight
                  : ArrowDownRight;
        const deltaCaption =
            delta == null
                ? "—"
                : `${positive ? "+" : ""}${cell.deltaMode === "percent" ? `${number(delta, 2)} %` : column.kind === "percent" ? `${number(delta, 2)} pp` : formatted(delta)}`;
        if (cell.type === "progress") {
            const percent = target > 0 ? (actual / target) * 100 : null;
            return (
                <div className="min-w-0 space-y-1">
                    <span className="block font-medium tabular-nums">
                        {formatted(actual)}
                    </span>
                    {percent !== null && (
                        <Progress
                            value={Math.min(100, Math.max(0, percent))}
                            aria-label={column.label}
                            aria-valuetext={`${number(percent, 1)} % von ${formatted(target)}`}
                            className="gap-0"
                        />
                    )}
                    <span className="block text-[11px] text-muted-foreground">
                        {percent === null ? "—" : `${number(percent, 1)} %`} von{" "}
                        {formatted(target)}
                    </span>
                </div>
            );
        }
        const deltaDisplay = (
            <span
                data-cell-tone={tone}
                className={cn(
                    "inline-flex items-center gap-0.5 rounded px-1 text-xs tabular-nums",
                    toneClasses[tone],
                )}
            >
                <DeltaIcon className="size-3" aria-hidden />
                {deltaCaption}
            </span>
        );
        if (cell.type === "comparison")
            return (
                <div className="min-w-0 space-y-1">
                    <div className="overflow-hidden rounded-md border text-center tabular-nums">
                        <div className="bg-muted/50 px-2 py-1">
                            <span className="sr-only">
                                {cell.targetLabel ?? "Soll"}:{" "}
                            </span>
                            {formatted(target)}
                        </div>
                        <div
                            className={cn(
                                "border-t px-2 py-1",
                                toneClasses[tone],
                            )}
                        >
                            <span className="sr-only">
                                {cell.valueLabel ?? "Ist"}:{" "}
                            </span>
                            {formatted(actual)}
                        </div>
                    </div>
                    {deltaDisplay}
                </div>
            );
        return (
            <div className="min-w-0 space-y-0.5">
                <span className="block font-medium tabular-nums">
                    {formatted(actual)}
                </span>
                {deltaDisplay}
            </div>
        );
    }
    if (cell) {
        const primary =
            (cell.primary
                ? cellText(row, cell.primary, column.field)
                : formatted(value)) || "—";
        const secondary = cellText(row, cell.secondary);
        const items = cellItems(row, column);
        if (cell.type === "avatars") {
            const people: AvatarPerson[] = items.map((item, i) => {
                const person =
                    typeof item === "object" && item
                        ? (item as Record<string, unknown>)
                        : { name: item };
                return {
                    id: String(person.id ?? i),
                    name: String(person[cell.nameField ?? "name"] ?? ""),
                    image: person[cell.imageField ?? "image"] as
                        string | undefined,
                };
            });
            return people.length ? (
                <PeopleGroup people={people} max={cell.max ?? 3} />
            ) : (
                "—"
            );
        }
        if (cell.type === "tags") {
            const max = Number.isFinite(cell.max)
                ? Math.max(1, Math.floor(cell.max!))
                : 3;
            const names = items
                .map((item) =>
                    typeof item === "object" && item
                        ? String(
                              (item as Record<string, unknown>)[
                                  cell.nameField ?? "name"
                              ] ??
                                  (item as Record<string, unknown>).label ??
                                  "",
                          )
                        : String(item ?? ""),
                )
                .filter(Boolean);
            return names.length ? (
                <div
                    className="flex min-w-0 flex-wrap items-center gap-1"
                    title={names.join(", ")}
                >
                    {names.slice(0, max).map((name, i) => (
                        <Badge
                            key={`${name}-${i}`}
                            variant="secondary"
                            className="max-w-full truncate"
                        >
                            {name}
                        </Badge>
                    ))}
                    {names.length > max && (
                        <Badge variant="outline">+{names.length - max}</Badge>
                    )}
                </div>
            ) : (
                "—"
            );
        }
        const Icon = cell.icon;
        return (
            <div className="flex min-w-0 items-center gap-2.5">
                {cell.type === "avatar" && (
                    <PersonAvatar
                        person={{
                            id: row.id,
                            name: primary,
                            image: cell.image
                                ? (recordValue(row, cell.image) as string)
                                : undefined,
                        }}
                    />
                )}
                {cell.type === "icon-text" && Icon && (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                        <Icon className="size-4" />
                    </span>
                )}
                <div className="min-w-0">
                    <div className="truncate font-medium" title={primary}>
                        {primary}
                    </div>
                    {secondary && (
                        <div
                            className="truncate text-xs font-normal leading-5 text-muted-foreground"
                            title={secondary}
                        >
                            {secondary}
                        </div>
                    )}
                </div>
            </div>
        );
    }
    if (value == null || value === "")
        return <span title="Nicht erfasst">—</span>;
    switch (column.kind) {
        case "currency":
        case "date":
        case "number":
        case "percent":
            return formatted(value);
        case "badge":
            return (
                <StatusBadge
                    value={value}
                    displayLabel={optionLabel(value, column)}
                />
            );
        default:
            return (
                <span className="block truncate" title={String(value ?? "")}>
                    {optionLabel(value, column) ?? String(value ?? "—")}
                </span>
            );
    }
}
