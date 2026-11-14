import { CreditCard, Banknote, Wallet, Building2 } from "lucide-react";
import { FormSummary } from "@/framework/forms/form-summary";
import { money } from "@/lib/format";
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
        name: "product",
        label: "Auswahl mit Bild & Status",
        kind: "select",
        selectedDisplay: "rich",
        default: "service",
        options: [
            {
                value: "service",
                label: "Verwaltungspaket",
                description: "Hausverwaltung · monatliche Abrechnung",
                image: "/images/building.svg",
                badge: "Verfügbar",
                badgeTone: "success",
            },
            {
                value: "inspection",
                label: "Objektbegehung",
                description: "Termin nach Vereinbarung",
                icon: <Building2 />,
                badge: "Auf Anfrage",
                badgeTone: "warning",
            },
        ],
    },
    {
        name: "quantity",
        label: "Anzahl",
        kind: "number",
        default: 1,
        min: 1,
        max: 50,
        step: 1,
    },
    {
        name: "payment_method",
        label: "Zahlungsart",
        kind: "choice-buttons",
        default: "card",
        options: [
            { value: "card", label: "Karte", icon: <CreditCard /> },
            { value: "cash", label: "Bar", icon: <Banknote /> },
            { value: "wallet", label: "Wallet", icon: <Wallet /> },
        ],
        description:
            "Interaktive Komponentenvorschau, keine Zahlungsabwicklung.",
    },
    {
        name: "memo",
        label: "Notiz mit Zeichenanzeige",
        kind: "textarea",
        minLength: 10,
        maxLength: 300,
        help: "Die Zeichenlimits werden im gemeinsamen Schema geprüft.",
        description: "Mindestens 10 und höchstens 300 Zeichen.",
    },
    {
        name: "features",
        label: "Ausstattung",
        kind: "multiselect",
        options: [
            { value: "lift", label: "Aufzug" },
            { value: "garden", label: "Garten" },
            { value: "parking", label: "Stellplatz" },
        ],
        description: "Mehrere Optionen auswählen und durchsuchen.",
    },
    {
        name: "channels",
        label: "Kontaktwege",
        kind: "checkbox-cards",
        searchable: true,
        selectAll: true,
        options: [
            {
                value: "email",
                label: "E-Mail",
                description: "Digitale Korrespondenz und Dokumente",
                badge: "Digital",
            },
            {
                value: "post",
                label: "Post",
                description: "Schriftliche Zustellung an die Postadresse",
            },
        ],
    },
    {
        name: "currency",
        label: "Currency · EUR",
        kind: "currency",
        required: true,
        default: 1250.5,
        min: 0,
        help: "Deutsche Betragseingabe mit EUR. Die API erhält eine Zahl, keinen formatierten Text.",
    },
    {
        name: "relation",
        label: "Objekt aus Datenbank",
        kind: "relation",
        resource: "properties",
        multiple: true,
        creatable: false,
        clearable: true,
        maxSelected: 5,
        filters: [{ field: "status", value: "active" }],
        displayText: (row) => String(row.name),
        secondaryText: (row) => `${row.code} · ${row.city}`,
        description:
            "Aktive Objekte · maximal 5 · keine Neuanlage aus diesem Feld.",
    },
    {
        name: "date",
        label: "Datum · begrenzt",
        kind: "date",
        minDate: "2026-01-01",
        maxDate: "2027-12-31",
        clearable: false,
        description: "2026–2027, ohne Löschtaste",
    },
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
                        <Stack>
                            <FieldGrid>
                                {fields.map((f) => (
                                    <ResourceField
                                        key={f.name}
                                        definition={f}
                                    />
                                ))}
                            </FieldGrid>
                            <FormSummary
                                definition={{
                                    title: "Zusammenfassung",
                                    items: (values) => [
                                        {
                                            id: "unit",
                                            label: "Einzelbetrag",
                                            value: money(values.currency),
                                        },
                                        {
                                            id: "quantity",
                                            label: "Anzahl",
                                            value: String(
                                                values.quantity ?? "—",
                                            ),
                                        },
                                        {
                                            id: "total",
                                            label: "Gesamt",
                                            value: money(
                                                Number(values.currency ?? 0) *
                                                    Number(
                                                        values.quantity ?? 0,
                                                    ),
                                            ),
                                            emphasis: true,
                                            separator: true,
                                        },
                                    ],
                                }}
                            />
                            <Button type="submit">Validierung prüfen</Button>
                        </Stack>
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
