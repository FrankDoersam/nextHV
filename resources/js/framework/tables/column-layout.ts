import type { ColumnDefinition, ResourceDefinition } from "../types";
export interface ColumnLayout {
    size: number;
    minSize: number;
    maxSize: number;
    grow: number;
}
export function columnLayout(
    column: ColumnDefinition,
    resource: Pick<ResourceDefinition, "columns" | "fields" | "titleField">,
    available: number,
): ColumnLayout {
    const options =
        resource.fields.find((field) => field.name === column.field)?.options ??
        (column.filter ? column.filter.options : undefined) ??
        [];
    const longestLabel = options.reduce(
        (longest, option) => Math.max(longest, option.label.length),
        0,
    );
    const badgeWidth = Math.ceil(longestLabel * 8.5 + 56);
    const numeric = column.kind === "number" || column.kind === "currency";
    const defaults =
        column.field === "code"
            ? [108, 88, 144, 0]
            : column.field === "status"
              ? [Math.min(168, Math.max(116, badgeWidth)), 104, 180, 0]
              : column.kind === "badge"
                ? [Math.min(200, Math.max(132, badgeWidth)), 112, 208, 0]
                : column.kind === "date"
                  ? [144, 128, 176, 0]
                  : numeric
                    ? column.kind === "currency"
                        ? [152, 128, 192, 0]
                        : [100, 88, 132, 0]
                    : column.field === resource.titleField ||
                        /address|name/.test(column.field)
                      ? [240, 192, 480, 2]
                      : [180, 144, 400, 1];
    const minSize = column.minSize ?? defaults[1],
        maxSize = Math.max(minSize, column.maxSize ?? defaults[2]);
    const requested =
        typeof column.size === "string"
            ? (available * parseFloat(column.size)) / 100
            : (column.size ?? defaults[0]);
    return {
        size: Math.min(
            maxSize,
            Math.max(
                minSize,
                Number.isFinite(requested) ? requested : defaults[0],
            ),
        ),
        minSize,
        maxSize,
        grow: column.grow ?? defaults[3],
    };
}
/** Respect min/max, assign percentage preferences, distribute remaining width only to flexible text. */
export function resolveColumnLayout(
    resource: Pick<ResourceDefinition, "columns" | "fields" | "titleField">,
    width: number,
    visibility: Record<string, boolean>,
    reserved = 88,
): Record<string, ColumnLayout> {
    const available = Math.max(0, width - reserved);
    const layouts = Object.fromEntries(
        resource.columns.map((column) => [
            column.field,
            columnLayout(column, resource, available),
        ]),
    );
    const visible = resource.columns
        .filter((column) => visibility[column.field] !== false)
        .map((column) => layouts[column.field]);
    if (!width) return layouts;
    let delta = available - visible.reduce((sum, item) => sum + item.size, 0);
    if (delta < 0) {
        const room = visible.reduce(
            (sum, item) => sum + item.size - item.minSize,
            0,
        );
        if (room > 0)
            for (const item of visible)
                item.size -=
                    Math.min(1, -delta / room) * (item.size - item.minSize);
    } else
        for (let i = 0; i < visible.length && delta > 0.1; i++) {
            const flexible = visible.filter(
                    (item) => item.grow > 0 && item.size < item.maxSize - 0.1,
                ),
                weight = flexible.reduce((sum, item) => sum + item.grow, 0);
            if (!weight) break;
            let allocated = 0;
            for (const item of flexible) {
                const add = Math.min(
                    item.maxSize - item.size,
                    (delta * item.grow) / weight,
                );
                item.size += add;
                allocated += add;
            }
            delta -= allocated;
        }
    for (const item of Object.values(layouts))
        item.size = Math.round(item.size);
    return layouts;
}
