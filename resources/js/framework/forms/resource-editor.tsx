import { ErrorState, SectionCard } from "@/components/blocks/content";
import { FieldGrid, Stack } from "@/components/blocks/layout";
import { Overlay } from "@/components/blocks/overlay";
import { ResourceField } from "@/components/fields/field";
import {
    Stepper,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperSeparator,
    StepperTitle,
    StepperTrigger,
} from "@/components/reui/stepper";
import { Button } from "@/components/ui/button";
import { getResource } from "@/modules/registry";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useReload } from "../data/hooks";
import { ApiError } from "../data/http";
import { dataProvider, normalizeValidationErrors } from "../data/provider";
import { ResourceCollection } from "../tables/resource-collection";
import type { FormRequest, Values } from "../types";
import { initialValues, schemaFor } from "./schema";
export function ResourceEditor({
    request,
    onClose,
}: {
    request: FormRequest;
    onClose: () => void;
}) {
    const formId = useId();
    const { resource, row } = request;
    const fields = resource.fields.filter(
        (f) => !request.reduced || f.required || f.reduced,
    );
    const groups = resource.groups?.filter((g) =>
        fields.some((f) => (f.group ?? "general") === g.id),
    ) ?? [{ id: "general", label: "Grunddaten" }];
    const form = useForm<Values>({
        defaultValues: initialValues(resource.fields, row, request.defaults),
        resolver: zodResolver(schemaFor(fields)),
        shouldUnregister: false,
    });
    const [step, setStep] = useState(0);
    const [error, setError] = useState<unknown>();
    const [discard, setDiscard] = useState(false);
    const [version, setVersion] = useState(row);
    const reload = useReload();
    const dirty = form.formState.isDirty;
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
    const close = () => (dirty ? setDiscard(true) : onClose());
    const refresh = async () => {
        if (!row) return;
        const latest = await dataProvider.one(resource, row.id);
        setVersion(latest);
        form.reset(initialValues(resource.fields, latest), {
            keepDirtyValues: true,
        });
    };
    const save = form.handleSubmit(
        async (values) => {
            setError(undefined);
            try {
                const saved = await dataProvider.save(
                    resource,
                    values,
                    version,
                );
                await reload();
                request.onSaved?.(saved);
                toast.success(`${resource.singular} gespeichert`);
                onClose();
            } catch (e) {
                setError(e);
                if (e instanceof ApiError) {
                    const errors = normalizeValidationErrors(e.errors);
                    for (const [name, message] of Object.entries(errors))
                        form.setError(name, { message });
                    const index = groups.findIndex((g) =>
                        fields.some((f) => f.group === g.id && errors[f.name]),
                    );
                    if (index >= 0) setStep(index);
                }
            }
        },
        (errors) => {
            const index = groups.findIndex((g) =>
                fields.some(
                    (f) => (f.group ?? "general") === g.id && errors[f.name],
                ),
            );
            if (index >= 0) setStep(index);
        },
    );
    const next = async () => {
        if (
            await form.trigger(
                fields
                    .filter((f) => (f.group ?? "general") === groups[step].id)
                    .map((f) => f.name),
            )
        )
            setStep(step + 1);
    };
    return (
        <>
            <Overlay
                open
                onClose={close}
                title={`${resource.singular} ${row ? "bearbeiten" : "anlegen"}`}
                description={
                    request.reduced
                        ? "Schnellerfassung · weitere Angaben später ergänzen"
                        : resource.description
                }
                presentation={request.presentation}
                footer={
                    <>
                        <Button type="button" variant="outline" onClick={close}>
                            Abbrechen
                        </Button>
                        {request.wizard && step > 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setStep(step - 1)}
                            >
                                <ChevronLeft />
                                Zurück
                            </Button>
                        )}
                        {request.wizard && step < groups.length - 1 ? (
                            <Button type="button" onClick={next}>
                                Weiter
                                <ChevronRight />
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                form={formId}
                                disabled={form.formState.isSubmitting}
                            >
                                <Save />
                                {form.formState.isSubmitting
                                    ? "Wird gespeichert …"
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
                                error instanceof ApiError &&
                                error.status === 409
                                    ? new Error(
                                          "Der Datensatz wurde zwischenzeitlich geändert. Neu laden, Änderungen prüfen und erneut speichern.",
                                      )
                                    : error
                            }
                            retry={
                                error instanceof ApiError &&
                                error.status === 409
                                    ? refresh
                                    : undefined
                            }
                        />
                    )}
                    {request.wizard && (
                        <Stepper value={step + 1}>
                            <StepperNav>
                                {groups.map((g, i) => (
                                    <StepperItem key={g.id} step={i + 1}>
                                        <StepperTrigger
                                            type="button"
                                            disabled={i > step}
                                            onClick={() => setStep(i)}
                                        >
                                            <StepperIndicator>
                                                {i + 1}
                                            </StepperIndicator>
                                            <StepperTitle>
                                                {g.label}
                                            </StepperTitle>
                                        </StepperTrigger>
                                        {i < groups.length - 1 && (
                                            <StepperSeparator />
                                        )}
                                    </StepperItem>
                                ))}
                            </StepperNav>
                        </Stepper>
                    )}
                    <FormProvider {...form}>
                        <form id={formId} onSubmit={save} className="space-y-6">
                            {groups.map((g, i) => (
                                <section
                                    key={g.id}
                                    hidden={request.wizard && step !== i}
                                >
                                    <SectionCard
                                        title={g.label}
                                        description={g.description}
                                    >
                                        <FieldGrid>
                                            {fields
                                                .filter(
                                                    (f) =>
                                                        (f.group ??
                                                            "general") === g.id,
                                                )
                                                .map((f) => (
                                                    <ResourceField
                                                        key={f.name}
                                                        definition={f}
                                                        editing={!!row}
                                                    />
                                                ))}
                                        </FieldGrid>
                                    </SectionCard>
                                </section>
                            ))}
                        </form>
                    </FormProvider>
                    {row &&
                        resource.relations?.map((relation) => (
                            <SectionCard
                                key={relation.resource + relation.field}
                                title={relation.label}
                                description={relation.description}
                            >
                                <ResourceCollection
                                    resource={getResource(relation.resource)}
                                    fixedFilters={[
                                        {
                                            field: relation.field,
                                            value: row.id,
                                        },
                                    ]}
                                    defaults={{ [relation.field]: row.id }}
                                    compact
                                    onSaved={refresh}
                                    form={form}
                                />
                            </SectionCard>
                        ))}
                </Stack>
            </Overlay>
            <Overlay
                open={discard}
                onClose={() => setDiscard(false)}
                title="Änderungen verwerfen?"
                presentation="dialog"
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() => setDiscard(false)}
                        >
                            Weiter bearbeiten
                        </Button>
                        <Button variant="destructive" onClick={onClose}>
                            Verwerfen
                        </Button>
                    </>
                }
            >
                <p>Die ungespeicherten Änderungen gehen verloren.</p>
            </Overlay>
        </>
    );
}
