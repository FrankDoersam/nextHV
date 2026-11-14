import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { Check, LoaderCircle, Trash2 } from "lucide-react";
import { ErrorState, Loading } from "@/components/blocks/content";
import { FieldGrid } from "@/components/blocks/layout";
import { Overlay } from "@/components/blocks/overlay";
import { ResourceField } from "@/components/fields/field";
import { Button } from "@/components/ui/button";
import { actionAvailability, type ResourceAction } from "../actions";
import { Checkbox } from "@/components/ui/checkbox";
import { patchRecord } from "../data/record-cache";
import { resourceKey } from "../data/hooks";
import type { RecordData } from "../types";
import { FormActionScope } from "./form-action-scope";
import { ApiError } from "../data/http";
import { normalizeValidationErrors } from "../data/provider";
import type { ActionContext, Values } from "../types";
import { initialValues } from "./initial-values";
export function ActionDialog({
    action,
    context,
    onClose,
    onComplete,
}: {
    action: ResourceAction;
    context: ActionContext;
    onClose: () => void;
    onComplete: (result: unknown) => void;
}) {
    const client = useQueryClient();
    const fields = useMemo(() => action.fieldsFor(context), [action, context]);
    const [selected, setSelected] = useState<string[]>([]);
    const [error, setError] = useState<unknown>();
    const [busy, setBusy] = useState(false);
    const [succeeded, setSucceeded] = useState(false);
    const running = useRef(false);
    const preparation = useQuery({
        queryKey: [
            "action-prepare",
            action.id,
            context.resource.name,
            context.rows.map((r) => r.id),
        ],
        enabled: !!action.prepare,
        queryFn: async () => (await action.prepare?.(context)) ?? {},
        staleTime: 0,
        gcTime: 0,
    });
    const form = useForm<Values>({
        defaultValues: initialValues(fields),
    });
    useEffect(() => {
        if (preparation.data?.defaults)
            form.reset(
                initialValues(fields, undefined, preparation.data.defaults),
            );
    }, [preparation.data, fields, form]);
    const preparing = !!action.prepare && preparation.isPending;
    const execute = async (values: Values) => {
        if (running.current || succeeded) return;
        const availability = actionAvailability(action, context);
        if (availability !== true) {
            setError(
                new Error(
                    typeof availability === "string"
                        ? availability
                        : "Diese Action ist derzeit nicht verfügbar.",
                ),
            );
            return;
        }
        const submitted = action.selectableFields
            ? Object.fromEntries(
                  Object.entries(values).filter(([name]) =>
                      selected.includes(name),
                  ),
              )
            : values;
        running.current = true;
        setBusy(true);
        setError(undefined);
        form.clearErrors();
        let completed = false;
        try {
            const response = await action.execute({
                ...context,
                values: submitted,
            });
            completed = true;
            setSucceeded(true);
            onComplete(response);
            const records = (response as { records?: RecordData[] } | undefined)
                ?.records;
            if (Array.isArray(records)) {
                await client.cancelQueries({
                    queryKey: resourceKey(context.resource.name),
                });
                for (const record of records)
                    patchRecord(client, context.resource.name, record);
                await client.invalidateQueries({
                    queryKey: [...resourceKey(context.resource.name), "list"],
                    refetchType: "none",
                });
                await client.invalidateQueries({
                    queryKey: ["overview"],
                    refetchType: "none",
                });
            } else if (action.refresh) await context.instance.reload();
            if (action.refresh || records)
                await context.instance.refreshForm?.();
            onClose();
        } catch (e) {
            setError(
                completed
                    ? new Error(
                          "Die Aktion wurde erfolgreich ausgeführt. Die Ansicht konnte nicht aktualisiert werden. Bitte lade die Seite neu.",
                      )
                    : e,
            );
            if (e instanceof ApiError)
                for (const [name, message] of Object.entries(
                    normalizeValidationErrors(e.errors),
                ))
                    form.setError(name, { message });
        } finally {
            running.current = false;
            setBusy(false);
        }
    };
    return (
        <Overlay
            open
            onClose={onClose}
            busy={busy}
            size="compact"
            title={action.label}
            description={
                action.description ??
                `${context.rows.length} ${context.rows.length === 1 ? context.resource.singular : context.resource.label} ausgewählt`
            }
            presentation="dialog"
            footer={
                <>
                    <Button variant="outline" disabled={busy} onClick={onClose}>
                        {succeeded ? "Schließen" : "Abbrechen"}
                    </Button>
                    {!succeeded && (
                        <Button
                            variant={
                                action.destructive ? "destructive" : "default"
                            }
                            disabled={
                                busy ||
                                preparing ||
                                preparation.isError ||
                                (action.selectableFields && !selected.length)
                            }
                            onClick={form.handleSubmit((values) =>
                                execute(values),
                            )}
                        >
                            {busy ? (
                                <LoaderCircle className="animate-spin" />
                            ) : action.destructive ? (
                                <Trash2 />
                            ) : null}
                            {busy
                                ? action.destructive
                                    ? "Wird gelöscht …"
                                    : "Wird ausgeführt …"
                                : action.label}
                        </Button>
                    )}
                </>
            }
        >
            <div className="space-y-5">
                {preparing ? (
                    <Loading rows={1} />
                ) : preparation.error ? (
                    <ErrorState
                        error={preparation.error}
                        retry={() => preparation.refetch()}
                    />
                ) : (
                    <>
                        {!!error && <ErrorState error={error} />}
                        {succeeded && (
                            <p
                                role="status"
                                className="flex items-center gap-2 text-sm"
                            >
                                <Check className="size-4" />
                                {action.label}: erfolgreich.
                            </p>
                        )}
                        <FormActionScope
                            target={{
                                ...context,
                                resource: { ...context.resource, fields },
                            }}
                        >
                            <FormProvider {...form}>
                                <form
                                    noValidate
                                    onSubmit={form.handleSubmit((v) =>
                                        execute(v),
                                    )}
                                >
                                    <fieldset disabled={busy || succeeded}>
                                        <FieldGrid>
                                            {fields.map((field) =>
                                                action.selectableFields ? (
                                                    <div
                                                        key={field.name}
                                                        className="col-span-full space-y-3 rounded-xl border bg-card p-4"
                                                    >
                                                        <label className="flex items-center gap-2 text-sm font-medium">
                                                            <Checkbox
                                                                checked={selected.includes(
                                                                    field.name,
                                                                )}
                                                                onCheckedChange={(
                                                                    checked,
                                                                ) =>
                                                                    setSelected(
                                                                        (
                                                                            current,
                                                                        ) =>
                                                                            checked
                                                                                ? [
                                                                                      ...current,
                                                                                      field.name,
                                                                                  ]
                                                                                : current.filter(
                                                                                      (
                                                                                          name,
                                                                                      ) =>
                                                                                          name !==
                                                                                          field.name,
                                                                                  ),
                                                                    )
                                                                }
                                                            />
                                                            {field.label} ändern
                                                        </label>
                                                        {selected.includes(
                                                            field.name,
                                                        ) && (
                                                            <ResourceField
                                                                definition={
                                                                    field
                                                                }
                                                            />
                                                        )}
                                                    </div>
                                                ) : (
                                                    <ResourceField
                                                        key={field.name}
                                                        definition={field}
                                                    />
                                                ),
                                            )}
                                        </FieldGrid>
                                    </fieldset>
                                    {!fields.length && !succeeded && (
                                        <p className="text-sm leading-6 text-muted-foreground">
                                            {action.destructive
                                                ? `${context.rows.length} ${context.rows.length === 1 ? "Datensatz" : "Datensätze"} wirklich löschen?`
                                                : `${action.label} für die Auswahl ausführen.`}
                                        </p>
                                    )}
                                </form>
                            </FormProvider>
                        </FormActionScope>
                    </>
                )}
            </div>
        </Overlay>
    );
}
