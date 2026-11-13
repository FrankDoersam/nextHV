import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ShieldAlert, Trash2 } from "lucide-react";
import { ErrorState, Loading } from "@/components/blocks/content";
import { FieldGrid } from "@/components/blocks/layout";
import { Overlay } from "@/components/blocks/overlay";
import { ResourceField } from "@/components/fields/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import type { ResourceAction } from "../actions";
import { ApiError } from "../data/http";
import { normalizeValidationErrors } from "../data/provider";
import type { ActionContext, Values } from "../types";
import { initialValues, schemaFor } from "./schema";
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
        defaultValues: initialValues(action.fields),
        resolver: zodResolver(schemaFor(action.fields)),
    });
    useEffect(() => {
        if (preparation.data?.defaults)
            form.reset(
                initialValues(
                    action.fields,
                    undefined,
                    preparation.data.defaults,
                ),
            );
    }, [preparation.data, action.fields, form]);
    const blockers = preparation.data?.blockers ?? [];
    const blocked = !!blockers.length;
    const execute = async (values: Values, token?: string) => {
        setBusy(true);
        setError(undefined);
        try {
            const response = await action.execute(
                { ...context, values },
                token,
            );
            onComplete(response);
            await context.instance.reload();
            await context.instance.refreshForm?.();
            toast.success(`${action.label}: erfolgreich`);
            onClose();
        } catch (e) {
            if (e instanceof ApiError && e.status === 428 && e.confirmation)
                setConfirmation({
                    token: e.confirmation.token,
                    message: e.message,
                    values,
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
            description={`${context.rows.length} ${context.resource.label} ausgewählt`}
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
                                preparation.isError
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
                            <FormProvider {...form}>
                                <form
                                    onSubmit={form.handleSubmit((v) =>
                                        execute(v),
                                    )}
                                >
                                    <FieldGrid>
                                        {action.fields.map((f) => (
                                            <ResourceField
                                                key={f.name}
                                                definition={f}
                                            />
                                        ))}
                                    </FieldGrid>
                                    {!action.fields.length && (
                                        <p className="text-sm leading-6 text-muted-foreground">
                                            {action.destructive
                                                ? "Die Auswahl wird vor dem Löschen serverseitig geprüft. Anschließend ist eine ausdrückliche Bestätigung erforderlich."
                                                : `${action.label} für die Auswahl ausführen.`}
                                        </p>
                                    )}
                                </form>
                            </FormProvider>
                        )}
                    </>
                )}
            </div>
        </Overlay>
    );
}
