import { parseRecordId, type RecordId } from "@/framework/record-id";
import { usePermissionRevision } from "@/framework/permissions";
import { useState } from "react";
import { hashKey, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDebounced } from "@/framework/data/hooks";
import { useResourceMany } from "@/framework/data/many";
import { resolveDataProvider } from "@/framework/data/provider-registry";
import { resourceKey, resourceListParams } from "@/framework/data/resource-key";
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
    | "onRetry"
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
    ) => Pick<ChoiceOption, "image" | "icon" | "badge" | "badgeTone" | "group">;
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
    usePermissionRevision();
    const resource = getResource(name);
    maxSelected = Math.min(100, Math.max(1, maxSelected));
    const workbench = useWorkbench();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [creationError, setCreationError] = useState<string>();
    const query = useDebounced(search);
    const includes = resource.picker?.includes ?? resource.includes;
    const selectionScope = hashKey([resourceKey(resource), includes]);
    const [recentSelection, setRecentSelection] = useState<{
        scope: string;
        records: RecordData[];
    }>({ scope: selectionScope, records: [] });
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
    const ids: RecordId[] = (
        props.multiple
            ? Array.isArray(props.value)
                ? props.value
                : []
            : props.value
              ? [props.value]
              : []
    )
        .map(parseRecordId)
        .filter((id): id is RecordId => id !== undefined);
    // One batched hydration request, independent of the current search term.
    const selected = useResourceMany(resource, ids, {
        includes,
        aggregates: [],
        staleTime: 30_000,
    });
    const searching = open && !props.disabled && search === query;
    const params = resourceListParams(resource, {
        query,
        limit: 25,
        filters,
        includes,
        aggregates: [],
    });
    const result = useQuery({
        // Leaving the active key removes this observer immediately, so TanStack
        // aborts unused requests on close or while the next term is debounced.
        // Keep active keys compatible with record patching and invalidation.
        queryKey: searching
            ? [...resourceKey(resource), "list", params]
            : [...resourceKey(resource), "picker", "idle"],
        queryFn: ({ signal }) =>
            resolveDataProvider(resource).list(resource, params, signal),
        enabled: searching,
        staleTime: 30_000,
        retry: false,
    });
    const rows = new Map<RecordId, RecordData>();
    if (recentSelection.scope === selectionScope)
        for (const row of recentSelection.records)
            if (ids.includes(row.id) && !selected.missingIds.includes(row.id))
                rows.set(row.id, row);
    for (const row of selected.records) rows.set(row.id, row);
    for (const row of result.data?.data ?? []) rows.set(row.id, row);
    const pendingSelection =
        selected.isFetching && ids.some((id) => !rows.has(id));
    const options: ChoiceOption[] = [...rows.values()].map((row) => ({
        ...optionMeta?.(row),
        value: row.id,
        label: primary(row),
        description: secondary(row),
    }));
    // Retain the caption during loading and for a current value that is no longer available.
    for (const id of ids)
        if (!options.some((option) => option.value === id)) {
            options.push({
                value: id,
                label: selected.isFetching
                    ? "Wird geladen …"
                    : selected.isError
                      ? `#${id} · Laden fehlgeschlagen`
                      : `#${id} · nicht verfügbar`,
                disabled: true,
            });
        }
    const commitSelection = (value: unknown, created?: RecordData) => {
        const nextIds = (
            Array.isArray(value) ? value : value == null ? [] : [value]
        ).flatMap((value) => parseRecordId(value) ?? []);
        const known = new Map(rows);
        if (created) known.set(created.id, created);
        setRecentSelection({
            scope: selectionScope,
            records: nextIds.flatMap((id) =>
                known.has(id) ? [known.get(id)!] : [],
            ),
        });
        props.onChange(value);
    };
    const searchFailed = searching && result.isError;
    return (
        <ChoicePicker
            {...props}
            onChange={commitSelection}
            options={options}
            visibleOptions={
                searching
                    ? options.filter((option) =>
                          result.data?.data.some(
                              (row) => row.id === option.value,
                          ),
                      )
                    : []
            }
            maxSelected={maxSelected}
            onOpenChange={setOpen}
            onSearch={(text) => {
                setSearch(text);
                setCreationError(undefined);
            }}
            loading={result.isFetching || search !== query || pendingSelection}
            error={
                creationError ??
                (searchFailed
                    ? "Suche fehlgeschlagen. Bitte erneut versuchen."
                    : selected.isError
                      ? "Auswahl konnte nicht geladen werden."
                      : undefined)
            }
            onRetry={
                !creationError && (searchFailed || selected.isError)
                    ? () => {
                          if (searchFailed) void result.refetch();
                          if (selected.isError) void selected.refetch();
                      }
                    : undefined
            }
            footer={
                creatable &&
                can(name, "create") && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={
                            props.disabled ||
                            (props.multiple && ids.length >= maxSelected)
                        }
                        onClick={() => {
                            workbench.openForm({
                                resource,
                                mode: "create",
                                reduced: true,
                                presentation: "dialog",
                                onSaved: async (row) => {
                                    const matching = await resolveDataProvider(
                                        resource,
                                    ).list(resource, {
                                        limit: 10,
                                        filters: [
                                            ...filters,
                                            { field: "id", value: row.id },
                                        ],
                                        includes,
                                        aggregates: [],
                                    });
                                    if (!matching.data.length) {
                                        setCreationError(
                                            "Der neue Datensatz entspricht nicht dem Auswahlfilter und wurde nicht ausgewählt.",
                                        );
                                        return;
                                    }
                                    commitSelection(
                                        props.multiple
                                            ? [
                                                  ...new Set([...ids, row.id]),
                                              ].slice(0, maxSelected)
                                            : row.id,
                                        matching.data[0],
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
