import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDebounced, useResourceList } from "@/framework/data/hooks";
import { dataProvider } from "@/framework/data/provider";
import { recordValue } from "@/framework/tables/cell-value";
import { can } from "@/framework/permissions";
import type { Filter, RecordData } from "@/framework/types";
import { useWorkbench } from "@/framework/workbench";
import { getResource } from "@/modules/registry";
import {
    ChoicePicker,
    type ChoicePickerProps,
    type ChoiceOption,
} from "./choice-picker";

export interface EntityPickerProps extends Omit<
    ChoicePickerProps,
    | "options"
    | "visibleOptions"
    | "onSearch"
    | "onOpenChange"
    | "loading"
    | "error"
    | "footer"
> {
    resource: string;
    labelField?: string;
    filters?: Filter[];
    creatable?: boolean;
    displayText?: (row: RecordData) => string;
    secondaryText?: (row: RecordData) => string;
    optionMeta?: (
        row: RecordData,
    ) => Pick<ChoiceOption, "image" | "icon" | "badge" | "badgeTone">;
}
export function RelationPicker({
    resource: name,
    labelField,
    filters = [],
    creatable = true,
    displayText,
    secondaryText,
    optionMeta,
    maxSelected = 100,
    ...props
}: EntityPickerProps) {
    const resource = getResource(name);
    maxSelected = Math.min(100, Math.max(1, maxSelected));
    const workbench = useWorkbench();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [creationError, setCreationError] = useState<string>();
    const query = useDebounced(search);
    const includes = resource.picker?.includes ?? resource.includes;
    const primary = (row: RecordData) =>
        displayText?.(row) ??
        String(
            recordValue(row, labelField ?? resource.titleField) ?? `#${row.id}`,
        );
    const secondary = (row: RecordData) =>
        secondaryText?.(row) ??
        [
            ...new Set(
                (resource.picker?.secondaryFields ?? ["code"])
                    .map((field) => recordValue(row, field))
                    .filter(
                        (value) =>
                            value != null &&
                            value !== "" &&
                            String(value) !== primary(row),
                    )
                    .map(String),
            ),
        ].join(" · ");
    const ids: number[] = (
        props.multiple
            ? Array.isArray(props.value)
                ? props.value
                : []
            : props.value
              ? [props.value]
              : []
    )
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);
    // One batched hydration request, independent of the current search term.
    const selected = useResourceList(
        resource,
        {
            filters: [{ field: "id", operator: "in", value: ids }],
            limit: 100,
            includes,
            aggregates: [],
        },
        ids.length > 0,
        false,
        30_000,
    );
    const result = useResourceList(
        resource,
        { query, limit: 25, filters, includes, aggregates: [] },
        open && !props.disabled && search === query,
        false,
        30_000,
    );
    const rows = new Map<number, RecordData>();
    if (!query)
        for (const row of selected.data?.data ?? []) rows.set(row.id, row);
    for (const row of result.data?.data ?? []) rows.set(row.id, row);
    // The selected title must remain available while a different term is searched.
    const displayRows = !open
        ? (selected.data?.data ?? [])
        : [...rows.values()];
    const options: ChoiceOption[] = displayRows.map((row) => ({
        ...optionMeta?.(row),
        value: row.id,
        label: primary(row),
        description: secondary(row),
    }));
    // Retain the caption during loading and for a current value that is no longer available.
    for (const id of ids)
        if (!options.some((option) => option.value === id)) {
            const row = selected.data?.data.find((record) => record.id === id);
            options.push({
                ...(row ? optionMeta?.(row) : {}),
                value: id,
                label: row
                    ? primary(row)
                    : selected.isFetching
                      ? "Wird geladen …"
                      : `#${id} · nicht verfügbar`,
                description: row ? secondary(row) : undefined,
            });
        }
    return (
        <ChoicePicker
            {...props}
            options={options}
            visibleOptions={
                search !== query
                    ? []
                    : open && query
                      ? options.filter((option) =>
                            result.data?.data.some(
                                (row) => row.id === option.value,
                            ),
                        )
                      : undefined
            }
            maxSelected={maxSelected}
            onOpenChange={setOpen}
            onSearch={(text) => {
                setSearch(text);
                setCreationError(undefined);
            }}
            loading={result.isFetching || search !== query}
            error={
                creationError ??
                (result.isError
                    ? "Suche fehlgeschlagen. Bitte erneut suchen."
                    : selected.isError
                      ? "Auswahl konnte nicht geladen werden."
                      : undefined)
            }
            footer={
                creatable &&
                can(name, "create") && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={props.disabled}
                        onClick={() => {
                            workbench.openForm({
                                resource,
                                mode: "create",
                                reduced: true,
                                presentation: "dialog",
                                onSaved: async (row) => {
                                    const matching = await dataProvider.list(
                                        resource,
                                        {
                                            limit: 10,
                                            filters: [
                                                ...filters,
                                                { field: "id", value: row.id },
                                            ],
                                        },
                                    );
                                    if (!matching.data.length) {
                                        setCreationError(
                                            "Der neue Datensatz entspricht nicht dem Auswahlfilter und wurde nicht ausgewählt.",
                                        );
                                        return;
                                    }
                                    props.onChange(
                                        props.multiple
                                            ? [
                                                  ...new Set([...ids, row.id]),
                                              ].slice(0, maxSelected)
                                            : row.id,
                                    );
                                },
                            });
                        }}
                    >
                        <Plus /> {resource.singular} anlegen
                    </Button>
                )
            }
        />
    );
}
