import { usePermissionRevision } from "../permissions";
import { useQueryClient } from "@tanstack/react-query";
import { patchRecord } from "../data/record-cache";
import { useEffect, useState, type ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceField } from "@/components/fields/field";
import { CheckboxList } from "@/components/fields/checkbox-list";
import { ErrorState } from "@/components/blocks/content";
import { can } from "../permissions";
import { useSaveRecord } from "../data/hooks";
import { normalizeValidationErrors } from "../data/provider";
import { resolveDataProvider } from "../data/provider-registry";
import { ApiError } from "../data/http";
import type {
    FieldDefinition,
    RecordData,
    ResourceDefinition,
    Values,
} from "../types";
import { initialValues } from "./initial-values";
import { formatFieldValue } from "./field-display";
import { KeyValueRows } from "@/components/blocks/key-value-rows";

export interface KeyValueProperty {
    name: string;
    editable?: boolean | ((record: RecordData) => boolean);
    render?: (value: unknown, record: RecordData) => ReactNode;
}
/** Explicit editable allowlist; read-only by default. Saves a single property with version checking. */
export function EditableKeyValueList({
    resource,
    record,
    properties,
}: {
    resource: ResourceDefinition;
    record: RecordData;
    properties: (string | KeyValueProperty)[];
}) {
    usePermissionRevision();
    const [editing, setEditing] = useState<string>();
    const [current, setCurrent] = useState(record);
    useEffect(() => {
        setCurrent(record);
    }, [record]);
    return (
        <KeyValueRows
            items={properties.flatMap((entry) => {
                const property =
                    typeof entry === "string" ? { name: entry } : entry;
                const field = resource.fields.find(
                    (f) => f.name === property.name,
                );
                if (!field || field.writeOnly) return [];
                const editable =
                    !field.disabled &&
                    !field.readonlyOnEdit &&
                    can(resource.name, "edit", current) &&
                    (typeof property.editable === "function"
                        ? property.editable(current)
                        : property.editable);
                return [
                    {
                        id: field.name,
                        label: field.label,
                        value:
                            editing === field.name ? (
                                <PropertyEditor
                                    resource={resource}
                                    record={current}
                                    field={field}
                                    onSaved={(saved) => {
                                        setCurrent(saved);
                                        setEditing(undefined);
                                    }}
                                    onCancel={() => setEditing(undefined)}
                                />
                            ) : (
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                    <span className="min-w-0 whitespace-pre-wrap break-words">
                                        {property.render?.(
                                            current[field.name],
                                            current,
                                        ) ?? formatFieldValue(field, current)}
                                    </span>
                                    {editable && (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`${field.label} bearbeiten`}
                                            disabled={!!editing}
                                            onClick={() =>
                                                setEditing(field.name)
                                            }
                                        >
                                            <Pencil />
                                        </Button>
                                    )}
                                </div>
                            ),
                    },
                ];
            })}
        />
    );
}
function PropertyEditor({
    resource,
    record,
    field,
    onSaved,
    onCancel,
}: {
    resource: ResourceDefinition;
    record: RecordData;
    field: FieldDefinition;
    onSaved: (record: RecordData) => void;
    onCancel: () => void;
}) {
    const client = useQueryClient();
    const [snapshot] = useState(record);
    const [error, setError] = useState<unknown>();
    const form = useForm<Values>({
        defaultValues: initialValues(resource.fields, snapshot),
        mode: "onBlur",
    });
    usePermissionRevision();
    const save = useSaveRecord(resource);
    const busy = form.formState.isSubmitting;
    return (
        <FormProvider {...form}>
            <form
                noValidate
                className="space-y-3"
                aria-label={`${field.label} ändern`}
                onSubmit={form.handleSubmit(async (values) => {
                    setError(undefined);
                    try {
                        const updated = await save(
                            { [field.name]: values[field.name] },
                            snapshot,
                        );
                        onSaved(updated);
                    } catch (e) {
                        setError(e);
                        if (e instanceof ApiError)
                            for (const [name, message] of Object.entries(
                                normalizeValidationErrors(e.errors),
                            ))
                                form.setError(name, { message });
                    }
                })}
                onKeyDown={(event) => {
                    if (event.key === "Escape" && !busy) {
                        event.stopPropagation();
                        onCancel();
                    }
                }}
            >
                <ResourceField
                    definition={{ ...field, disabled: busy }}
                    editing
                />
                {!!error && <ErrorState error={error} />}
                <div className="flex flex-wrap justify-end gap-2">
                    {error instanceof ApiError && error.status === 409 && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={async () => {
                                try {
                                    const latest = await resolveDataProvider(
                                        resource,
                                    ).one(resource, record.id);
                                    patchRecord(client, resource.name, latest);
                                    onSaved(latest);
                                } catch (e) {
                                    setError(e);
                                }
                            }}
                        >
                            Aktuellen Stand laden
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        <X /> Abbrechen
                    </Button>
                    <Button type="submit" size="sm" disabled={busy}>
                        <Check />
                        {busy ? "Speichert …" : "Speichern"}
                    </Button>
                </div>
            </form>
        </FormProvider>
    );
}

/** Direct boolean mutations using the same checkbox cards and versioned save contract. */
export function BooleanPropertyList({
    resource,
    record,
    names,
    layout = "cards",
}: {
    resource: ResourceDefinition;
    record: RecordData;
    names: string[];
    layout?: "list" | "cards";
}) {
    usePermissionRevision();
    const save = useSaveRecord(resource);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const fields = resource.fields.filter(
        (field) =>
            names.includes(field.name) &&
            field.kind === "checkbox" &&
            !field.writeOnly,
    );
    return (
        <div className="space-y-3">
            <CheckboxList
                aria-label="Eigenschaften direkt ändern"
                layout={layout}
                options={fields.map((field) => ({
                    value: field.name,
                    label: field.label,
                    description: field.description,
                    disabled: field.disabled || field.readonlyOnEdit,
                }))}
                value={fields
                    .filter((field) => record[field.name])
                    .map((field) => field.name)}
                disabled={busy || !can(resource.name, "edit", record)}
                onChange={async (value) => {
                    const selected = value as string[];
                    const changes = Object.fromEntries(
                        fields
                            .filter(
                                (field) =>
                                    !field.disabled &&
                                    !field.readonlyOnEdit &&
                                    selected.includes(field.name) !==
                                        !!record[field.name],
                            )
                            .map((field) => [
                                field.name,
                                selected.includes(field.name),
                            ]),
                    );
                    setBusy(true);
                    setError(undefined);
                    try {
                        await save(changes, record);
                    } catch (e) {
                        setError(e);
                    } finally {
                        setBusy(false);
                    }
                }}
            />
            {!!error && <ErrorState error={error} />}
        </div>
    );
}
