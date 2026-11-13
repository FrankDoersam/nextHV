import { DynamicList, ListRow, SectionCard } from "@/components/blocks/content";
import { FieldGrid, PageHeader, Stack } from "@/components/blocks/layout";
import { ResourceField } from "@/components/fields/field";
import { Button } from "@/components/ui/button";
import { initialValues, schemaFor } from "@/framework/forms/schema";
import type { FieldDefinition, Values } from "@/framework/types";
import { useWorkbench } from "@/framework/workbench";
import { properties } from "@/modules/registry";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
const fields: FieldDefinition[] = [
    {
        name: "currency",
        label: "Currency · EUR",
        kind: "currency",
        required: true,
        default: 1250.5,
        min: 0,
    },
    {
        name: "relation",
        label: "Objekt aus Datenbank",
        kind: "relation",
        resource: "properties",
    },
    { name: "date", label: "Datum", kind: "date" },
    { name: "date_range", label: "Datumsbereich", kind: "date-range" },
    { name: "month", label: "Monat", kind: "month" },
    { name: "month_range", label: "Monatsbereich", kind: "month-range" },
    { name: "time", label: "Uhrzeit", kind: "time" },
];
export default function ComponentsPage() {
    const form = useForm<Values>({
        defaultValues: initialValues(fields),
        resolver: zodResolver(schemaFor(fields)),
    });
    const w = useWorkbench();
    return (
        <Stack>
            <PageHeader
                eyebrow="Framework"
                title="Ein Baukasten. Klare Konventionen."
                description="Zentrale Felder, Dialoge, Sheets, Wizard und Listen mit derselben Validierung wie im CRUD-Alltag."
            />
            <SectionCard
                title="Felder & Picker"
                description="Interaktive Vorschau der wiederverwendbaren Komponenten."
            >
                <FormProvider {...form}>
                    <form
                        onSubmit={form.handleSubmit(() =>
                            toast.success("Alle Felder sind gültig."),
                        )}
                    >
                        <FieldGrid>
                            {fields.map((f) => (
                                <ResourceField key={f.name} definition={f} />
                            ))}
                        </FieldGrid>
                        <Button type="submit">Validierung prüfen</Button>
                    </form>
                </FormProvider>
            </SectionCard>
            <SectionCard
                title="Wizard, Dialog & Sheet"
                actions={
                    <Button
                        onClick={() =>
                            w.openForm({
                                resource: properties,
                                mode: "create",
                                wizard: true,
                            })
                        }
                    >
                        Objekt-Wizard öffnen
                    </Button>
                }
            >
                <DynamicList
                    items={[
                        {
                            id: "dialog",
                            title: "Dialog",
                            description:
                                "Fokussierte Erfassung im modalen Fenster",
                        },
                        {
                            id: "sheet",
                            title: "Sheet",
                            description: "Bearbeiten mit Kontext zur Seite",
                        },
                    ]}
                    search
                    searchText={(r) => r.title + " " + r.description}
                    getKey={(r) => r.id}
                    renderItem={(r) => (
                        <ListRow
                            title={r.title}
                            description={r.description}
                            trailing={
                                <Button
                                    variant="outline"
                                    onClick={() =>
                                        w.openForm({
                                            resource: properties,
                                            mode: "create",
                                            presentation: r.id as
                                                "dialog" | "sheet",
                                            reduced: true,
                                        })
                                    }
                                >
                                    Schnellerfassung
                                </Button>
                            }
                        />
                    )}
                />
            </SectionCard>
        </Stack>
    );
}
