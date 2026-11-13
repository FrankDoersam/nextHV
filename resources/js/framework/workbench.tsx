import { ErrorState } from "@/components/blocks/content";
import { FieldGrid } from "@/components/blocks/layout";
import { Overlay } from "@/components/blocks/overlay";
import { ResourceField } from "@/components/fields/field";
import { Button } from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { createContext, useContext, useState, type ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { ResourceAction } from "./actions";
import { extractActionFeedback, type ActionFeedback } from "./action-feedback";
import { resources } from "@/modules/registry";
import { useReload } from "./data/hooks";
import { ApiError } from "./data/http";
import { normalizeValidationErrors } from "./data/provider";
import { ResourceEditor } from "./forms/resource-editor";
import { initialValues, schemaFor } from "./forms/schema";
import { can } from "./permissions";
import type {
    ActionContext,
    FormRequest,
    Presentation,
    ResourceInstance,
    Values,
} from "./types";
interface Workbench {
    openForm: (request: FormRequest) => void;
    runAction: (
        action: ResourceAction,
        context: Omit<ActionContext, "values" | "instance"> & {
            instance?: Partial<ResourceInstance>;
        },
    ) => void;
    presentation: Presentation;
    setPresentation: (value: Presentation) => void;
}
const Context = createContext<Workbench | null>(null);
export function useWorkbench() {
    const value = useContext(Context);
    if (!value) throw new Error("WorkbenchProvider fehlt.");
    return value;
}
export function WorkbenchProvider({ children }: { children: ReactNode }) {
    const [forms, setForms] = useState<(FormRequest & { key: number })[]>([]);
    const [action, setAction] = useState<{
        definition: ResourceAction;
        context: ActionContext;
    } | null>(null);
    const [presentation, setPresentation] = useState<Presentation>("sheet");
    const navigate = useNavigate();
    const reload = useReload();
    const openForm = (request: FormRequest) =>
        setForms((items) => [
            ...items,
            {
                ...request,
                presentation: request.presentation ?? presentation,
                key: Date.now() + Math.random(),
            },
        ]);
    const runAction: Workbench["runAction"] = (definition, context) => {
        if (
            !context.rows.length ||
            (!definition.bulk && context.rows.length !== 1) ||
            !context.rows.every(
                (row) =>
                    definition.visible(row) &&
                    can(context.resource.name, definition.id, row),
            )
        )
            return;
        const instance: ResourceInstance = {
            reload,
            openForm,
            navigate,
            ...context.instance,
        };
        const fullContext = { ...context, instance, values: {} };
        if (definition.id === "edit") {
            void definition.execute(fullContext);
            return;
        }
        setAction({ definition, context: fullContext });
    };
    return (
        <Context.Provider
            value={{ openForm, runAction, presentation, setPresentation }}
        >
            {children}
            {forms.map((request, i) => (
                <ResourceEditor
                    key={request.key}
                    request={request}
                    onClose={() =>
                        setForms((items) =>
                            items.filter((x) => x.key !== request.key),
                        )
                    }
                />
            ))}
            {action && (
                <ActionDialog
                    key={
                        action.definition.id +
                        action.context.rows.map((r) => r.id).join("-")
                    }
                    action={action.definition}
                    context={action.context}
                    onClose={() => setAction(null)}
                    presentation={presentation}
                />
            )}
        </Context.Provider>
    );
}
function ActionDialog({
    action,
    context,
    onClose,
    presentation,
}: {
    action: ResourceAction;
    context: ActionContext;
    onClose: () => void;
    presentation: Presentation;
}) {
    const [error, setError] = useState<unknown>();
    const [confirmation, setConfirmation] = useState<{
        token: string;
        message: string;
        values: Values;
    }>();
    const [busy, setBusy] = useState(false);
    const [outcome, setOutcome] = useState<ActionFeedback>();
    const form = useForm<Values>({
        defaultValues: initialValues(
            action.fields,
            undefined,
            action.id === "clone"
                ? {
                      [action.fields.find((f) => f.name === "display_name")
                          ? "display_name"
                          : "name"]: `${context.rows[0].display_name ?? context.rows[0].name ?? context.rows[0].code} · Kopie`
                  }
                : undefined,
        ),
        resolver: zodResolver(schemaFor(action.fields)),
    });
    const execute = async (values: Values, token?: string) => {
        setBusy(true);
        setError(undefined);
        try {
            const response = await action.execute({ ...context, values }, token);
            await context.instance.reload();
            await context.instance.refreshForm?.();
            const feedback = extractActionFeedback(response);
            if (feedback?.severity === "error") {
                toast.error(feedback.message);
            } else {
                toast.success(feedback?.message ?? `${action.label}: erfolgreich`);
            }
            if (feedback?.record) {
                setOutcome(feedback);
            } else {
                onClose();
            }
        } catch (e) {
            if (e instanceof ApiError && e.status === 428 && e.confirmation) {
                setConfirmation({
                    token: e.confirmation.token,
                    message: e.message,
                    values,
                });
            } else {
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
    const target =
        outcome?.navigate &&
        Number.isSafeInteger(outcome.navigate.id) &&
        outcome.navigate.id > 0 &&
        resources.some((r) => r.name === outcome.navigate?.resource)
            ? `/${outcome.navigate.resource}/${outcome.navigate.id}`
            : null;

    return (
        <Overlay
            open
            onClose={() => !busy && onClose()}
            title={action.label}
            description={`${context.rows.length} ${context.resource.label} ausgewählt`}
            presentation={presentation}
            footer={
                outcome ? (
                    <>
                        <Button variant="outline" onClick={onClose}>Schließen</Button>
                        {target && (
                            <Button onClick={() => {
                                onClose();
                                context.instance.navigate(target);
                            }}>Datensatz öffnen</Button>
                        )}
                    </>
                ) : (
                <>
                    <Button variant="outline" disabled={busy} onClick={onClose}>
                        Abbrechen
                    </Button>
                    <Button
                        variant={action.destructive ? "destructive" : "default"}
                        disabled={busy}
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
                        {busy
                            ? "Wird ausgeführt …"
                            : confirmation
                              ? "Bestätigen"
                              : action.label}
                    </Button>
                </>
                )
            }
        >
            {!!error && <ErrorState error={error} />}{" "}
            {outcome ? (
                <div className="space-y-3">
                    {outcome.message && <p role="status">{outcome.message}</p>}
                    {outcome.record && (
                        <dl className="space-y-2">
                            {Object.entries(outcome.record).map(([name, value]) => (
                                <div key={name} className="flex gap-3 text-sm">
                                    <dt className="min-w-32 font-medium">{name}</dt>
                                    <dd className="break-all">
                                        {value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>
            ) : confirmation ? (
                <p className="text-sm leading-6">{confirmation.message}</p>
            ) : (
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit((v) => execute(v))}>
                        <FieldGrid>
                            {action.fields.map((f) => (
                                <ResourceField key={f.name} definition={f} />
                            ))}
                        </FieldGrid>
                        {!action.fields.length && (
                            <p className="text-sm text-muted-foreground">
                                {action.label} für {context.rows.length}{" "}
                                ausgewählte Datensätze ausführen.
                            </p>
                        )}
                    </form>
                </FormProvider>
            )}
        </Overlay>
    );
}
