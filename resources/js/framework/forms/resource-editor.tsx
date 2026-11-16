import { useI18n } from "../i18n";
import { cn } from "@/lib/utils";
import { FormSummary } from "./form-summary";
import { FormActionScope } from "./form-action-scope";
import { Badge } from "@/components/ui/badge";
import { label } from "@/lib/format";
import { ErrorState } from "@/components/blocks/content";
import { FormLayout, FormSection } from "@/components/blocks/form-section";
import { FieldGrid, Stack } from "@/components/blocks/layout";
import { Overlay } from "@/components/blocks/overlay";
import { ResourceField } from "@/components/fields/field";
import {
    CStepper10,
    CStepper10Content,
} from "@/components/examples/c-stepper-10";
import { useCStepper10Navigation } from "@/components/examples/c-stepper-10-navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Save, RefreshCw } from "lucide-react";
import {
    useEffect,
    useId,
    useState,
    type ComponentProps,
    type ReactNode,
} from "react";
import { FormProvider, useFormContext, useWatch } from "react-hook-form";
import { useReload } from "../data/hooks";
import { ApiError } from "../data/http";
import { RowActions } from "../tables/resource-collection";
import { RelationCollection } from "../tables/relation-collection";
import type { FlowControls } from "./flow";
import type {
    FormGroupDefinition,
    FormRequest,
    Values,
    RecordData,
} from "../types";
import { useResourceForm } from "./use-resource-form";
import { creationNames } from "./create-relations";
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
    const { t } = useI18n();
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
    const [step, setStep] = useState(0);
    const [discard, setDiscard] = useState(false);
    const [pendingBack, setPendingBack] = useState(false);
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
    const [focusField, setFocusField] = useState<string>();
    const reload = useReload();
    const {
        form,
        version,
        error,
        setError,
        completion,
        dirty,
        busy,
        validating,
        save,
        validate,
        refresh,
        retryCompletion,
    } = useResourceForm({
        ...request,
        includeCreateRelations: !flow,
        onInvalid: errorStep,
        onSaved: async (saved) => {
            onDirtyChange?.(false);
            await request.onSaved?.(saved);
            if (flow) flow.onSaved(saved);
            else onClose();
        },
    });
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
    function errorStep(errors: Record<string, unknown>) {
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
    }
    const wizardNavigation = useCStepper10Navigation({
        active: step,
        count: groups.length,
        onChange: setStep,
        canBack: !completion,
        canNext: !completion,
        canFinish: !completion,
        busy: busy || !!completion,
        validate: async (currentStep) => {
            const group = groups[currentStep];
            if (!group) return false;
            const names = [
                ...fields
                    .filter((f) => (f.group ?? "general") === group.id)
                    .map((f) => f.name),
                ...createRelations
                    .filter((relation) => relation.group === group.id)
                    .flatMap((relation) =>
                        creationNames(relation, form.getValues()),
                    ),
            ];
            return validate(names);
        },
    });
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
            wizard={!!(request.wizard || flow)}
            bodyResetKey={request.wizard ? step : flow?.index}
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
                !request.wizard &&
                !flow &&
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
                    {!completion && request.wizard && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!wizardNavigation.canBack}
                            onClick={() => void wizardNavigation.back()}
                        >
                            <ChevronLeft />
                            {t("back")}
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
                            <ChevronLeft /> {t("back")}
                        </Button>
                    )}
                </>
            }
            presentation={
                request.wizard || flow ? "sheet" : request.presentation
            }
            footer={
                <>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={close}
                    >
                        {completion ? t("close") : t("cancel")}
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
                            disabled={!wizardNavigation.canNext}
                            onClick={() => void wizardNavigation.next()}
                        >
                            {validating || wizardNavigation.validating ? t("checking") : t("next")}
                            <ChevronRight />
                        </Button>
                    ) : (
                        <Button
                            key="save"
                            type="submit"
                            form={formId}
                            disabled={
                                busy ||
                                (request.wizard && !flow && !wizardNavigation.canFinish)
                            }
                        >
                            <Save />
                            {busy
                                ? t("saving")
                                : flow
                                  ? flow.index < flow.steps.length - 1
                                      ? "Speichern & weiter"
                                      : "Ablauf abschließen"
                                  : t("save")}
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
                                    !flow &&
                                    step < groups.length - 1
                                ) {
                                    event.preventDefault();
                                    void wizardNavigation.next();
                                } else void save(event);
                            }}
                            className={cn(
                                "space-y-6",
                                (request.wizard || flow) &&
                                    (summary
                                        ? "mx-auto w-full max-w-5xl"
                                        : "mx-auto w-full max-w-3xl"),
                            )}
                            noValidate
                        >
                            <CStepper10
                                enabled={!!(request.wizard || flow)}
                                steps={
                                    flow
                                        ? flow.steps.map((label, index) => ({
                                              id: String(index),
                                              label,
                                          }))
                                        : groups.map((group) => ({
                                              id: group.id,
                                              label: group.stepLabel ?? group.label,
                                              shortLabel: group.stepShortLabel,
                                              description: group.description,
                                          }))
                                }
                                active={flow ? flow.index : step}
                                navigation={flow ? undefined : wizardNavigation}
                                busy={busy || !!completion}
                                singleContent={!!flow}
                                idPrefix={formId + "-stepper"}
                            >
                            <fieldset
                                disabled={busy || !!completion}
                                className="min-w-0"
                            >
                                {(request.wizard || flow) && (
                                    <div
                                        data-slot="wizard-step-heading"
                                        className="mb-5 min-w-0"
                                    >
                                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                                {flow
                                                    ? flow.steps[flow.index]
                                                    : groups[step]?.label === resource.singular
                                                      ? "Grunddaten"
                                                      : groups[step]?.label}
                                            </h2>
                                            <p className="text-xs font-medium tabular-nums text-muted-foreground" aria-live="polite">
                                                Schritt {flow ? flow.index + 1 : step + 1} von{" "}
                                                {flow ? flow.steps.length : groups.length}
                                            </p>
                                        </div>
                                        {request.wizard && groups[step]?.description && (
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                {groups[step].description}
                                            </p>
                                        )}
                                    </div>
                                )}
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
                                        <CStepper10Content
                                            key={g.id}
                                            enabled={!!request.wizard && !flow}
                                            step={i + 1}
                                            active={step}
                                            idPrefix={formId + "-stepper"}
                                        >
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
                                                request.wizard
                                                    ? "plain"
                                                    : resource.editor?.sectionStyle
                                            }
                                            hideHeading={!!request.wizard}
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
                                        </CStepper10Content>
                                    ))}
                                </FormLayout>
                            </fieldset>
                            </CStepper10>
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
