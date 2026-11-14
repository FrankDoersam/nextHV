import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { ShieldAlert, Trash2 } from "lucide-react";
import { ErrorState, Loading } from "@/components/blocks/content";
import { FieldGrid } from "@/components/blocks/layout";
import { Overlay } from "@/components/blocks/overlay";
import { ResourceField } from "@/components/fields/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/reui/alert";
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
    const [confirmation, setConfirmation] = useState<{
        token: string;
        message: string;
        values: Values;
    }>();
    const [busy, setBusy] = useState(false);
    const preparation = useQuery({
        queryKey: [
            "action-prepare",
            action.id,
            context.resource.name,
            context.rows.map((r) => r.id),
        ],
        queryFn: async () => (await action.prepare(context)) ?? {},
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
    const blockers = preparation.data?.blockers ?? [];
    const blocked = !!blockers.length;
    const execute = async (values: Values, token?: string) => {
        if (busy) return;
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
        const submitted =
            action.selectableFields && !token
                ? Object.fromEntries(
                      Object.entries(values).filter(([name]) =>
                          selected.includes(name),
                      ),
                  )
                : values;
        setBusy(true);
        setError(undefined);
        form.clearErrors();
        try {
            const response = await action.execute(
                { ...context, values: submitted },
                token,
            );
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
            toast.success(`${action.label}: erfolgreich`);
            onClose();
        } catch (e) {
            if (e instanceof ApiError && e.status === 428 && e.confirmation)
                setConfirmation({
                    token: e.confirmation.token,
                    message: e.message,
                    values: submitted,
                });
            else {
                setConfirmation(undefined);
                setError(e);
                if (e instanceof ApiError)
                    for (const [name, message] of Object.entries(
                        normalizeValidationErrors(e.errors),
                    ))
                        form.setError(name, { message });
            }
        } finally {
            setBusy(false);
        }
    };
    return (
        <Overlay
            open
            onClose={onClose}
            busy={busy}
            size="compact"
            title={blocked ? "Löschen nicht möglich" : action.label}
            description={
                action.description ??
                `${context.rows.length} ${context.resource.label} ausgewählt`
            }
            presentation="dialog"
            footer={
                <>
                    <Button variant="outline" disabled={busy} onClick={onClose}>
                        {blocked ? "Schließen" : "Abbrechen"}
                    </Button>
                    {!blocked && (
                        <Button
                            variant={
                                action.destructive ? "destructive" : "default"
                            }
                            disabled={
                                busy ||
                                preparation.isPending ||
                                preparation.isError ||
                                (action.selectableFields && !selected.length)
                            }
                            onClick={
                                confirmation
                                    ? () =>
                                          execute(
                                              confirmation.values,
                                              confirmation.token,
                                          )
                                    : form.handleSubmit((v) => execute(v))
                            }
                        >
                            {action.destructive && <Trash2 />}
                            {busy
                                ? "Wird ausgeführt …"
                                : confirmation
                                  ? `${action.label} bestätigen`
                                  : action.label}
                        </Button>
                    )}
                </>
            }
        >
            <div className="space-y-5">
                {preparation.isPending ? (
                    <Loading rows={1} />
                ) : preparation.error ? (
                    <ErrorState
                        error={preparation.error}
                        retry={() => preparation.refetch()}
                    />
                ) : blocked ? (
                    <Alert variant="warning">
                        <ShieldAlert />
                        <AlertTitle className="line-clamp-none">
                            Diese Auswahl enthält geschützte Objekte
                        </AlertTitle>
                        <AlertDescription>
                            <ul className="space-y-3">
                                {blockers.map((b, i) => (
                                    <li key={i}>
                                        <p className="font-medium text-foreground">
                                            {b.label}
                                        </p>
                                        <ul className="mt-1 list-disc space-y-1 pl-4">
                                            {b.reasons.map((r) => (
                                                <li key={r}>{r}</li>
                                            ))}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2">
                                Es wurde kein Datensatz gelöscht.
                            </p>
                        </AlertDescription>
                    </Alert>
                ) : (
                    <>
                        {!!error && <ErrorState error={error} />}
                        {confirmation ? (
                            <Alert
                                variant={
                                    action.destructive ? "warning" : "info"
                                }
                            >
                                <ShieldAlert />
                                <AlertTitle>
                                    Bestätigung erforderlich
                                </AlertTitle>
                                <AlertDescription>
                                    {confirmation.message}
                                </AlertDescription>
                            </Alert>
                        ) : (
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
                                        {!fields.length && (
                                            <p className="text-sm leading-6 text-muted-foreground">
                                                {action.destructive
                                                    ? "Die Auswahl wird vor dem Löschen serverseitig geprüft. Anschließend ist eine ausdrückliche Bestätigung erforderlich."
                                                    : `${action.label} für die Auswahl ausführen.`}
                                            </p>
                                        )}
                                    </form>
                                </FormProvider>
                            </FormActionScope>
                        )}
                    </>
                )}
            </div>
        </Overlay>
    );
}
