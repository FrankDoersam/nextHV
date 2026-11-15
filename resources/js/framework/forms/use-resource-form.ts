import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useSaveRecord } from "../data/hooks";
import { ApiError } from "../data/http";
import { normalizeValidationErrors } from "../data/provider";
import { resolveDataProvider } from "../data/provider-registry";
import type { FormRequest, RecordData, Values } from "../types";
import { initialValues } from "./initial-values";
import { creationDefaults } from "./create-relations";

export interface ResourceFormOptions extends Pick<
    FormRequest,
    | "resource"
    | "row"
    | "defaults"
    | "fields"
    | "reduced"
    | "context"
    | "onSaved"
> {
    includeCreateRelations?: boolean;
    onInvalid?: (errors: Record<string, unknown>) => void;
    /** Presentation-specific conversion only; business validation stays on the server. */
    transformValues?: (values: Values) => Values | Promise<Values>;
}

/** Headless controller shared by pages, sheets, dialogs and custom forms.
 * Mount one controller per record (key by provider/resource/id when switching).
 */
export function useResourceForm(options: ResourceFormOptions) {
    const { resource, row, context } = options;
    const defaults = initialValues(resource.fields, row, {
        ...options.defaults,
        ...(context ? { [context.field]: context.id } : {}),
    });
    const form = useForm<Values>({
        defaultValues: {
            ...defaults,
            ...(!row && options.includeCreateRelations !== false
                ? creationDefaults(resource, defaults)
                : {}),
        },
        shouldUnregister: false,
        mode: "onBlur",
    });
    const [version, setVersion] = useState(row);
    const [error, setError] = useState<unknown>();
    const [completion, setCompletion] = useState<RecordData>();
    const [phase, setPhase] = useState<
        "idle" | "saving" | "validating" | "refreshing" | "completing"
    >("idle");
    const lock = useRef(false);
    const savedRef = useRef<RecordData | undefined>(undefined);
    const saveRecord = useSaveRecord(resource);
    // RHF needs a dirtyFields subscription to preserve local values on refresh.
    const { isDirty: dirty, dirtyFields, isSubmitting } = form.formState;
    const busy = phase !== "idle" || isSubmitting;
    const withContext = (values: Values) => ({
        ...values,
        ...(context && context.mode !== "prefill"
            ? { [context.field]: context.id }
            : {}),
    });
    const report = (failure: unknown) => {
        setError(failure);
        if (failure instanceof ApiError) {
            const errors = normalizeValidationErrors(failure.errors);
            for (const [name, message] of Object.entries(errors))
                form.setError(name, { type: "server", message });
            options.onInvalid?.(errors);
        }
    };
    const complete = async (saved: RecordData) => {
        try {
            await options.onSaved?.(saved);
        } catch (failure) {
            setError(
                new Error(
                    `Der Datensatz wurde gespeichert. Der Folgeschritt ist fehlgeschlagen: ${failure instanceof Error ? failure.message : "Bitte erneut versuchen."}`,
                ),
            );
        }
    };
    const save = form.handleSubmit(async (values) => {
        if (lock.current || savedRef.current) return;
        lock.current = true;
        setPhase("saving");
        setError(undefined);
        form.clearErrors();
        try {
            const transformed = options.transformValues
                ? await options.transformValues(values)
                : values;
            const scoped = withContext(transformed);
            const attributes = options.fields
                ? Object.fromEntries(
                      resource.fields
                          .filter(
                              (f) =>
                                  options.fields!.includes(f.name) &&
                                  !f.readonlyOnEdit &&
                                  !f.disabled,
                          )
                          .map((f) => [f.name, scoped[f.name]]),
                  )
                : scoped;
            const saved = await saveRecord(attributes, version);
            savedRef.current = saved;
            setVersion(saved);
            setCompletion(saved);
            form.reset(initialValues(resource.fields, saved));
            setPhase("completing");
            await complete(saved);
        } catch (failure) {
            report(failure);
        } finally {
            lock.current = false;
            setPhase("idle");
        }
    }, options.onInvalid);
    const retryCompletion = async () => {
        if (lock.current || !savedRef.current) return;
        lock.current = true;
        setPhase("completing");
        setError(undefined);
        try {
            await complete(savedRef.current);
        } finally {
            lock.current = false;
            setPhase("idle");
        }
    };
    const validate = async (names?: string[]): Promise<boolean> => {
        if (lock.current || savedRef.current) return false;
        lock.current = true;
        setPhase("validating");
        setError(undefined);
        form.clearErrors(names);
        try {
            if (!(await form.trigger(names, { shouldFocus: true })))
                return false;
            if (!names || names.length)
                await resolveDataProvider(resource).validate(
                    resource,
                    withContext(form.getValues()),
                    version,
                    names,
                );
            return true;
        } catch (failure) {
            report(failure);
            return false;
        } finally {
            lock.current = false;
            setPhase("idle");
        }
    };
    const refresh = async () => {
        if (!row || lock.current || savedRef.current) return;
        lock.current = true;
        setPhase("refreshing");
        try {
            const latest = await resolveDataProvider(resource).one(
                resource,
                row.id,
            );
            setVersion(latest);
            form.reset(
                initialValues(
                    resource.fields,
                    latest,
                    context ? { [context.field]: context.id } : undefined,
                ),
                { keepDirtyValues: true },
            );
            setError(undefined);
        } catch (failure) {
            report(failure);
        } finally {
            lock.current = false;
            setPhase("idle");
        }
    };
    return {
        form,
        version,
        error,
        setError,
        completion,
        dirty,
        dirtyFields,
        busy,
        phase,
        validating: phase === "validating",
        save,
        validate,
        refresh,
        retryCompletion,
    };
}
