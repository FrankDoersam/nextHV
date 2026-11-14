import {
    PersonAvatar,
    PeopleGroup,
    type AvatarPerson,
} from "@/components/blocks/people-avatar";
import { StatusBadge } from "@/components/blocks/content";
import { Badge } from "@/components/ui/badge";
import type { ColumnDefinition, RecordData } from "../types";
import { cellItems, cellText, recordValue, optionLabel } from "./cell-value";
import { date, money, number } from "@/lib/format";
export function CellRenderer({
    column,
    row,
}: {
    column: ColumnDefinition;
    row: RecordData;
}) {
    if (column.render) return column.render(row);
    const cell = column.cell;
    if (cell) {
        const primary = cellText(row, cell.primary, column.field) || "—";
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
    const value = recordValue(row, column.field);
    switch (column.kind) {
        case "currency":
            return money(value);
        case "date":
            return date(value);
        case "number":
            return number(value, 2);
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
