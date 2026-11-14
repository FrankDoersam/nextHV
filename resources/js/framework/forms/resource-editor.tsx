import { FormSummary } from "./form-summary";
import { FormActionScope } from "./form-action-scope";
import { Badge } from "@/components/ui/badge";
import { label } from "@/lib/format";
import { ErrorState } from "@/components/blocks/content";
import { FormSection } from "@/components/blocks/form-section";
import { FieldGrid, Stack } from "@/components/blocks/layout";
import { Overlay } from "@/components/blocks/overlay";
import { ResourceField } from "@/components/fields/field";
import { WizardProgress } from "@/components/blocks/wizard-progress";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Save, Link, RefreshCw } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useReload, useSaveRecord } from "../data/hooks";
import { ApiError } from "../data/http";
import { dataProvider, normalizeValidationErrors } from "../data/provider";
import { RowActions } from "../tables/resource-collection";
import { RelationCollection } from "../tables/relation-collection";
import type { FlowControls } from "./flow";
import type { FormRequest, Values } from "../types";
import { initialValues } from "./initial-values";
export function ResourceEditor({
    request,
    onClose,
    onDirtyChange,
    nested,
    stacked,
    flow,
}: {
    request: FormRequest;
    onClose: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    nested?: ReactNode;
    stacked?: boolean;
    flow?: FlowControls;
}) {
    const formId = useId();
    const { resource, row } = request;
    const fields = resource.fields.filter(
        (f) => !request.reduced || f.required || f.reduced,
    );
    const groups = resource.groups?.filter((g) =>
        fields.some((f) => (f.group ?? "general") === g.id),
    ) ?? [{ id: "general", label: "Grunddaten" }];
    const editorTabs =
        !request.wizard && !flow
            ? resource.editor?.tabs?.filter(
                  (tab) =>
                      (tab.relations && !!row) ||
                      tab.groups?.some((id) =>
                          groups.some((group) => group.id === id),
                      ) ||
                      !!tab.summary,
              )
            : undefined;
    const [tab, setTab] = useState(editorTabs?.[0]?.id ?? "");
    const activeTab =
        editorTabs?.find((item) => item.id === tab) ?? editorTabs?.[0];
    const form = useForm<Values>({
        defaultValues: initialValues(resource.fields, row, request.defaults),
        shouldUnregister: false,
        mode: "onBlur",
    });
    const [validating, setValidating] = useState(false);
    const [step, setStep] = useState(0);
    const [error, setError] = useState<unknown>();
    const [discard, setDiscard] = useState(false);
    const [pendingBack, setPendingBack] = useState(false);
    const [version, setVersion] = useState(row);
    const reload = useReload();
    const saveRecord = useSaveRecord(resource);
    const dirty = form.formState.isDirty;
    const busy = form.formState.isSubmitting || validating;
    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    useEffect(() => {
        const warn = (e: BeforeUnloadEvent) => {
            if (dirty) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);
    const close = () => {
        if (!busy) {
            if (dirty) setDiscard(true);
            else onClose();
        }
    };
    const refresh = async () => {
        if (!row) return;
        const latest = await dataProvider.one(resource, row.id);
        setVersion(latest);
        form.reset(
            initialValues(
                resource.fields,
                latest,
                request.context
                    ? { [request.context.field]: request.context.id }
                    : undefined,
            ),
            { keepDirtyValues: true },
        );
    };
    const errorStep = (errors: Record<string, unknown>) => {
        const index = groups.findIndex((g) =>
            fields.some(
                (f) => (f.group ?? "general") === g.id && errors[f.name],
            ),
        );
        if (index >= 0) {
            setStep(index);
            const errorTab = editorTabs?.find((tab) =>
                tab.groups?.includes(groups[index].id),
            );
            if (errorTab) setTab(errorTab.id);
        }
    };
    const save = form.handleSubmit(async (values) => {
        setError(undefined);
        form.clearErrors();
        try {
            const attributes = {
                ...values,
                ...(request.context && request.context.mode !== "prefill"
                    ? { [request.context.field]: request.context.id }
                    : {}),
            };
            const saved = await saveRecord(attributes, version);
            setVersion(saved);
            form.reset(initialValues(resource.fields, saved));
            onDirtyChange?.(false);
            await request.onSaved?.(saved);
            toast.success(`${resource.singular} gespeichert`);
            if (flow) flow.onSaved(saved);
            else onClose();
        } catch (e) {
            setError(e);
            if (e instanceof ApiError) {
                const errors = normalizeValidationErrors(e.errors);
                for (const [name, message] of Object.entries(errors))
                    form.setError(name, { message });
                errorStep(errors);
            }
        }
    }, errorStep);
    const next = async () => {
        if (busy) return;
        const names = fields
            .filter((f) => (f.group ?? "general") === groups[step].id)
            .map((f) => f.name);
        setValidating(true);
        setError(undefined);
        form.clearErrors(names);
        try {
            await dataProvider.validate(
                resource,
                form.getValues(),
                version,
                names,
            );
            setStep((current) => Math.min(current + 1, groups.length - 1));
        } catch (e) {
            setError(e);
            if (e instanceof ApiError) {
                const errors = normalizeValidationErrors(e.errors);
                for (const [name, message] of Object.entries(errors))
                    form.setError(name, { type: "server", message });
                const first = names.find((name) => errors[name]);
                if (first) form.setFocus(first);
            }
        } finally {
            setValidating(false);
        }
    };
    const headerActions = (
        <div className="flex gap-1">
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Direktlink kopieren"
                onClick={() =>
                    navigator.clipboard.writeText(window.location.href).then(
                        () => toast.success("Direktlink kopiert"),
                        () =>
                            toast.error(
                                "Direktlink konnte nicht kopiert werden.",
                            ),
                    )
                }
            >
                <Link />
            </Button>
            {row && (
                <>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy}
                        aria-label="Formular aktualisieren"
                        onClick={() => refresh().catch(setError)}
                    >
                        <RefreshCw />
                    </Button>
                    <RowActions
                        resource={resource}
                        row={version!}
                        instance={{
                            form,
                            formResource: resource,
                            refreshForm: refresh,
                            reload,
                        }}
                        exclude={["edit", "delete"]}
                        placement="form"
                    />
                </>
            )}
        </div>
    );
    const discardDialog = (
        <Overlay
            open={discard}
            onClose={() => {
                setDiscard(false);
                setPendingBack(false);
            }}
            title="Änderungen verwerfen?"
            description="Deine Eingaben wurden noch nicht gespeichert."
            presentation="dialog"
            size="compact"
            footer={
                <>
                    <Button
                        variant="outline"
                        onClick={() => {
                            setDiscard(false);
                            setPendingBack(false);
                        }}
                    >
                        Weiter bearbeiten
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            onDirtyChange?.(false);
                            if (pendingBack) flow?.onBack?.();
                            else onClose();
                        }}
                    >
                        Änderungen verwerfen
                    </Button>
                </>
            }
        >
            <p className="text-sm leading-6">
                Die ungespeicherten Änderungen dieses Formulars gehen verloren.
            </p>
        </Overlay>
    );
    return (
        <Overlay
            open
            onClose={close}
            busy={busy}
            fill={!!request.wizard || !!flow}
            stacked={stacked || discard}
            nested={
                <>
                    {nested}
                    {discardDialog}
                </>
            }
            title={`${resource.singular} ${row ? "bearbeiten" : "anlegen"}`}
            icon={<resource.icon />}
            titleBadge={
                resource.editor?.titleBadge !== false && (
                    <Badge variant="secondary">
                        {version?.status
                            ? label(String(version.status))
                            : row
                              ? "Bearbeiten"
                              : "Neu"}
                    </Badge>
                )
            }
            actions={headerActions}
            tabs={
                activeTab && editorTabs
                    ? {
                          value: activeTab.id,
                          onValueChange: setTab,
                          items: editorTabs.map((tab) => ({
                              value: tab.id,
                              label: tab.label,
                          })),
                      }
                    : undefined
            }
            description={
                resource.editor?.description === false
                    ? undefined
                    : (resource.editor?.description ??
                      (row
                          ? String(row[resource.titleField] ?? `#${row.id}`)
                          : request.context
                            ? "Mit dem aktuellen Datensatz verknüpft"
                            : "Neuen Datensatz erfassen"))
            }
            footerStart={
                <>
                    {request.wizard && step > 0 && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setStep(step - 1)}
                        >
                            <ChevronLeft />
                            Zurück
                        </Button>
                    )}
                    {flow?.onBack && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                                if (dirty) {
                                    setPendingBack(true);
                                    setDiscard(true);
                                } else flow.onBack?.();
                            }}
                        >
                            <ChevronLeft /> Zurück
                        </Button>
                    )}
                </>
            }
            presentation={request.presentation}
            header={
                flow ? (
                    <WizardProgress
                        label={flow.label}
                        steps={flow.steps.map((label, index) => ({
                            id: String(index),
                            label,
                        }))}
                        active={flow.index}
                    />
                ) : request.wizard ? (
                    <WizardProgress
                        steps={groups}
                        active={step}
                        onSelect={setStep}
                        busy={busy}
                    />
                ) : undefined
            }
            footer={
                <>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={close}
                    >
                        Abbrechen
                    </Button>
                    {request.wizard && step < groups.length - 1 ? (
                        <Button
                            key="wizard-next"
                            type="button"
                            disabled={busy}
                            onClick={(event) => {
                                event.preventDefault();
                                void next();
                            }}
                        >
                            {validating ? "Wird geprüft …" : "Weiter"}
                            <ChevronRight />
                        </Button>
                    ) : (
                        <Button
                            key="save"
                            type="submit"
                            form={formId}
                            disabled={busy}
                        >
                            <Save />
                            {busy
                                ? "Wird gespeichert …"
                                : flow
                                  ? flow.index < flow.steps.length - 1
                                      ? "Speichern & weiter"
                                      : "Ablauf abschließen"
                                  : "Speichern"}
                        </Button>
                    )}
                </>
            }
        >
            <Stack>
                {!!error && (
                    <ErrorState
                        error={
                            error instanceof ApiError && error.status === 409
                                ? new Error(
                                      "Der Datensatz wurde zwischenzeitlich geändert. Neu laden, Änderungen prüfen und erneut speichern.",
                                  )
                                : error
                        }
                        retry={
                            error instanceof ApiError && error.status === 409
                                ? refresh
                                : undefined
                        }
                    />
                )}
                <FormActionScope
                    target={{
                        resource,
                        rows: version ? [version] : [],
                        instance: {
                            form,
                            formResource: resource,
                            refreshForm: refresh,
                            reload,
                        },
                    }}
                >
                    <FormProvider {...form}>
                        <form
                            id={formId}
                            onSubmit={(event) => {
                                if (
                                    request.wizard &&
                                    step < groups.length - 1
                                ) {
                                    event.preventDefault();
                                    void next();
                                } else void save(event);
                            }}
                            className="space-y-6"
                            noValidate
                        >
                            {groups.map((g, i) => (
                                <FormSection
                                    key={g.id}
                                    hidden={
                                        (request.wizard && step !== i) ||
                                        (!!activeTab &&
                                            !activeTab.groups?.includes(g.id))
                                    }
                                    variant={resource.editor?.sectionStyle}
                                    title={g.label}
                                    description={g.description}
                                >
                                    <FieldGrid>
                                        {fields
                                            .filter(
                                                (f) =>
                                                    (f.group ?? "general") ===
                                                    g.id,
                                            )
                                            .map((f) => (
                                                <ResourceField
                                                    key={f.name}
                                                    definition={
                                                        request.context
                                                            ?.field ===
                                                            f.name &&
                                                        request.context.mode !==
                                                            "prefill"
                                                            ? {
                                                                  ...f,
                                                                  disabled: true,
                                                                  lockedReason:
                                                                      "Durch den aktuellen Datensatz vorgegeben.",
                                                              }
                                                            : f
                                                    }
                                                    editing={!!row}
                                                />
                                            ))}
                                    </FieldGrid>
                                </FormSection>
                            ))}
                            {(activeTab?.summary ??
                                resource.editor?.summary) && (
                                <FormSummary
                                    definition={
                                        (activeTab?.summary ??
                                            resource.editor?.summary)!
                                    }
                                    record={version}
                                />
                            )}
                        </form>
                    </FormProvider>
                </FormActionScope>
                {row &&
                    !flow &&
                    (!activeTab || activeTab.relations) &&
                    resource.relations?.map((relation) => (
                        <RelationCollection
                            key={relation.resource + relation.field}
                            relation={relation}
                            parent={{ resource: resource.name, id: row.id }}
                            surface="editor"
                            onSaved={refresh}
                            form={form}
                            formResource={resource}
                        />
                    ))}
            </Stack>
        </Overlay>
    );
}
