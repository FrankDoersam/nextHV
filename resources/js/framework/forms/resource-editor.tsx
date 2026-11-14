import { FormSummary } from "./form-summary";
import { FormActionScope } from "./form-action-scope";
import { Badge } from "@/components/ui/badge";
import { label } from "@/lib/format";
import { ErrorState } from "@/components/blocks/content";
import { FormLayout, FormSection } from "@/components/blocks/form-section";
import { FieldGrid, Stack } from "@/components/blocks/layout";
import { Overlay } from "@/components/blocks/overlay";
import { ResourceField } from "@/components/fields/field";
import { WizardProgress } from "@/components/blocks/wizard-progress";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Save, RefreshCw } from "lucide-react";
import {
    useEffect,
    useId,
    useRef,
    useState,
    type ComponentProps,
    type ReactNode,
} from "react";
import {
    FormProvider,
    useForm,
    useFormContext,
    useWatch,
} from "react-hook-form";
import { useReload, useSaveRecord } from "../data/hooks";
import { ApiError } from "../data/http";
import { normalizeValidationErrors } from "../data/provider";
import { resolveDataProvider } from "../data/provider-registry";
import { RowActions } from "../tables/resource-collection";
import { RelationCollection } from "../tables/relation-collection";
import type { FlowControls } from "./flow";
import type {
    FormGroupDefinition,
    FormRequest,
    Values,
    RecordData,
} from "../types";
import { initialValues } from "./initial-values";
import { creationDefaults, creationNames } from "./create-relations";
import { RelationRepeater } from "./relation-repeater";
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
    const createRelations =
        !row && !flow ? (resource.createRelations ?? []) : [];
    const fields = resource.fields.filter(
        (f) =>
            (!request.fields || request.fields.includes(f.name)) &&
            (!request.reduced || f.required || f.reduced),
    );
    const groups = resource.groups?.filter(
        (g) =>
            fields.some((f) => (f.group ?? "general") === g.id) ||
            createRelations.some((relation) => relation.group === g.id),
    ) ?? [{ id: "general", label: "Grunddaten" }];
    const editorTabs =
        !request.wizard && !flow && !request.fields
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
    const summary = !request.fields
        ? ((request.wizard || flow
              ? resource.editor?.wizardSummary
              : undefined) ??
          activeTab?.summary ??
          resource.editor?.summary)
        : undefined;
    const defaults = initialValues(resource.fields, row, request.defaults);
    const form = useForm<Values>({
        defaultValues: {
            ...defaults,
            ...(!row && !flow ? creationDefaults(resource, defaults) : {}),
        },
        shouldUnregister: false,
        mode: "onBlur",
    });
    const [validating, setValidating] = useState(false);
    const submissionLock = useRef(false);
    const [working, setWorking] = useState(false);
    const [completion, setCompletion] = useState<RecordData>();
    const [step, setStep] = useState(0);
    const [error, setError] = useState<unknown>();
    const [discard, setDiscard] = useState(false);
    const [pendingBack, setPendingBack] = useState(false);
    const [version, setVersion] = useState(row);
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
    const [focusField, setFocusField] = useState<string>();
    const reload = useReload();
    const saveRecord = useSaveRecord(resource);
    const dirty = form.formState.isDirty;
    const busy = working || form.formState.isSubmitting || validating;
    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    useEffect(() => {
        if (!focusField) return;
        // Focus after React has revealed the rejected field's tab and region.
        form.setFocus(focusField);
        setFocusField(undefined);
    }, [focusField, form]);
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
        const latest = await resolveDataProvider(resource).one(
            resource,
            row.id,
        );
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
        errors = Object.fromEntries(
            errorPaths(errors).map((name) => [name, true]),
        );
        const groupHasError = (group: FormGroupDefinition) =>
            fields.some(
                (f) => (f.group ?? "general") === group.id && errors[f.name],
            ) ||
            createRelations.some(
                (relation) =>
                    relation.group === group.id &&
                    Object.keys(errors).some(
                        (name) =>
                            name === relation.relation ||
                            name.startsWith(`${relation.relation}.`),
                    ),
            );
        const rejectedGroups = groups.filter((g) => groupHasError(g));
        setOpenGroups((current) => ({
            ...current,
            ...Object.fromEntries(
                rejectedGroups.map((group) => [group.id, true]),
            ),
        }));
        const index = groups.findIndex((g) => groupHasError(g));
        if (index >= 0) {
            setStep(index);
            const errorTab = editorTabs?.find((tab) =>
                tab.groups?.includes(groups[index].id),
            );
            if (errorTab) setTab(errorTab.id);
        }
        setFocusField(
            fields.find((field) => errors[field.name])?.name ??
                Object.keys(errors)[0],
        );
    };
    const complete = async (saved: RecordData) => {
        try {
            await request.onSaved?.(saved);
            if (flow) flow.onSaved(saved);
            else onClose();
        } catch (failure) {
            setError(
                new Error(
                    `Der Datensatz wurde gespeichert. Der Folgeschritt ist fehlgeschlagen: ${failure instanceof Error ? failure.message : "Bitte erneut versuchen."}`,
                ),
            );
        }
    };
    const retryCompletion = async () => {
        if (!completion || submissionLock.current) return;
        submissionLock.current = true;
        setWorking(true);
        setError(undefined);
        try {
            await complete(completion);
        } finally {
            submissionLock.current = false;
            setWorking(false);
        }
    };
    const save = form.handleSubmit(async (values) => {
        if (submissionLock.current || completion) return;
        submissionLock.current = true;
        setWorking(true);
        setError(undefined);
        form.clearErrors();
        try {
            const valuesWithContext = {
                ...values,
                ...(request.context && request.context.mode !== "prefill"
                    ? { [request.context.field]: request.context.id }
                    : {}),
            };
            const attributes = request.fields
                ? Object.fromEntries(
                      fields
                          .filter(
                              (field) =>
                                  !field.readonlyOnEdit && !field.disabled,
                          )
                          .map((field) => [
                              field.name,
                              valuesWithContext[field.name],
                          ]),
                  )
                : valuesWithContext;
            const saved = await saveRecord(attributes, version);
            setVersion(saved);
            form.reset(initialValues(resource.fields, saved));
            onDirtyChange?.(false);
            setCompletion(saved);
            await complete(saved);
        } catch (e) {
            setError(e);
            if (e instanceof ApiError) {
                const errors = normalizeValidationErrors(e.errors);
                for (const [name, message] of Object.entries(errors))
                    form.setError(name, { message });
                errorStep(errors);
            }
        } finally {
            submissionLock.current = false;
            setWorking(false);
        }
    }, errorStep);
    const next = async () => {
        if (busy || submissionLock.current || completion) return;
        submissionLock.current = true;
        const names = [
            ...fields
                .filter((f) => (f.group ?? "general") === groups[step].id)
                .map((f) => f.name),
            ...createRelations
                .filter((relation) => relation.group === groups[step].id)
                .flatMap((relation) =>
                    creationNames(relation, form.getValues()),
                ),
        ];
        setValidating(true);
        setError(undefined);
        form.clearErrors(names);
        try {
            if (!(await form.trigger(names, { shouldFocus: true }))) return;
            if (names.length)
                await resolveDataProvider(resource).validate(
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
                errorStep(errors);
            }
        } finally {
            submissionLock.current = false;
            setValidating(false);
        }
    };
    const headerActions = (
        <div className="flex gap-1">
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
            fill={!!flow}
            wizard={!!request.wizard}
            size={(request.wizard || flow) && summary ? "wide" : "form"}
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
            actions={completion ? undefined : headerActions}
            tabs={
                activeTab && editorTabs
                    ? {
                          value: activeTab.id,
                          onValueChange: setTab,
                          icons: resource.editor?.tabIcons,
                          items: editorTabs.map((tab) => ({
                              value: tab.id,
                              label: tab.label,
                              icon: tab.icon ?? resource.icon,
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
                    {!completion && request.wizard && step > 0 && (
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
                    {!completion && flow?.onBack && (
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
                        steps={groups.map((group) => ({
                            ...group,
                            label: group.stepLabel ?? group.label,
                        }))}
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
                        {completion ? "Schließen" : "Abbrechen"}
                    </Button>
                    {completion ? (
                        <Button
                            type="button"
                            disabled={busy}
                            onClick={() => void retryCompletion()}
                        >
                            <RefreshCw />{" "}
                            {busy
                                ? "Wird fortgesetzt …"
                                : "Folgeschritt wiederholen"}
                        </Button>
                    ) : request.wizard && step < groups.length - 1 ? (
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
                            <fieldset
                                disabled={busy || !!completion}
                                className="min-w-0"
                            >
                                <FormLayout
                                    aside={!!request.wizard || !!flow}
                                    summary={
                                        summary ? (
                                            <FormSummary
                                                definition={summary}
                                                record={version}
                                            />
                                        ) : undefined
                                    }
                                >
                                    {groups.map((g, i) => (
                                        <EditorSection
                                            key={g.id}
                                            hidden={
                                                (request.wizard &&
                                                    step !== i) ||
                                                (!!activeTab &&
                                                    !activeTab.groups?.includes(
                                                        g.id,
                                                    ))
                                            }
                                            group={g}
                                            variant={
                                                resource.editor?.sectionStyle
                                            }
                                            collapsible={
                                                request.wizard || flow
                                                    ? false
                                                    : g.collapsible
                                            }
                                            open={
                                                openGroups[g.id] ??
                                                (request.fields
                                                    ? true
                                                    : g.defaultOpen) ??
                                                true
                                            }
                                            onOpenChange={(open) =>
                                                setOpenGroups((current) => ({
                                                    ...current,
                                                    [g.id]: open,
                                                }))
                                            }
                                        >
                                            <FieldGrid>
                                                {fields
                                                    .filter(
                                                        (f) =>
                                                            (f.group ??
                                                                "general") ===
                                                            g.id,
                                                    )
                                                    .map((f) => (
                                                        <ResourceField
                                                            key={f.name}
                                                            definition={
                                                                request.context
                                                                    ?.field ===
                                                                    f.name &&
                                                                request.context
                                                                    .mode !==
                                                                    "prefill"
                                                                    ? {
                                                                          ...f,
                                                                          disabled: true,
                                                                          lockedReason:
                                                                              row
                                                                                  ? undefined
                                                                                  : "Durch den aktuellen Datensatz vorgegeben.",
                                                                      }
                                                                    : f
                                                            }
                                                            editing={!!row}
                                                        />
                                                    ))}
                                            </FieldGrid>
                                            {createRelations
                                                .filter(
                                                    (relation) =>
                                                        relation.group === g.id,
                                                )
                                                .map((relation) => (
                                                    <RelationRepeater
                                                        key={relation.relation}
                                                        definition={relation}
                                                        disabled={busy}
                                                    />
                                                ))}
                                        </EditorSection>
                                    ))}
                                </FormLayout>
                            </fieldset>
                        </form>
                    </FormProvider>
                </FormActionScope>
                {row &&
                    !flow &&
                    !request.fields &&
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

function errorPaths(errors: Record<string, unknown>, prefix = ""): string[] {
    return Object.entries(errors).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (
            typeof value === "string" ||
            (value && typeof value === "object" && "message" in value)
        )
            return [path];
        return value && typeof value === "object"
            ? errorPaths(value as Record<string, unknown>, path)
            : [];
    });
}

/** Watch summaries inside their region, keeping field editing isolated. */
function EditorSection({
    group,
    children,
    ...props
}: Omit<
    ComponentProps<typeof FormSection>,
    "title" | "description" | "summary"
> & {
    group: FormGroupDefinition;
}) {
    const { control } = useFormContext<Values>();
    const values = useWatch({ control, disabled: !group.summary });
    return (
        <FormSection
            {...props}
            title={group.label}
            description={group.description}
            summary={group.summary?.(values)}
        >
            {children}
        </FormSection>
    );
}
