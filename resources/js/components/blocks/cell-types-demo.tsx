import { Building2 } from "lucide-react";
import { RecordTable } from "@/framework/tables/record-table";
import type { ColumnDefinition, RecordData } from "@/framework/types";
import { SectionCard } from "./content";

const columns: ColumnDefinition[] = [
    {
        field: "name",
        label: "Icon & Titel",
        size: "22%",
        minSize: 200,
        maxSize: 300,
        cell: { type: "icon-text", icon: Building2 },
    },
    {
        field: "address",
        label: "Titel & Unterzeile",
        size: "24%",
        minSize: 210,
        maxSize: 340,
        cell: { type: "text", secondary: "location" },
    },
    {
        field: "contact",
        label: "Avatar",
        size: "20%",
        minSize: 180,
        maxSize: 260,
        cell: { type: "avatar", secondary: "team" },
    },
    {
        field: "people",
        label: "Avatar-Gruppe",
        size: "14%",
        minSize: 130,
        maxSize: 180,
        cell: { type: "avatars", max: 2 },
    },
    {
        field: "tags",
        label: "Tags",
        size: "20%",
        minSize: 180,
        maxSize: 280,
        cell: { type: "tags", max: 2 },
    },
];
// Deliberately fictional presentation data; no business enum options or API records are copied here.
const rows: RecordData[] = [
    {
        id: 1,
        updated_at: "2026-11-14T09:00:00Z",
        name: "Beispiel · Wohnensemble am Park mit besonders langer Bezeichnung",
        address: "Beispielpromenade 128, Hinterhaus und Seitenflügel",
        location: "12345 Musterstadt · Quartier Nord",
        contact: "Mara Beispiel",
        team: "Technische Verwaltung",
        people: [
            { id: "a", name: "Mara Beispiel" },
            { id: "b", name: "Alex Muster" },
            { id: "c", name: "Robin Demo" },
            { id: "d", name: "Kim Beispiel" },
        ],
        tags: ["Projekt Alpha", "Team Nord", "Pilot", "Review"],
    },
    {
        id: 2,
        updated_at: "2026-11-14T09:00:00Z",
        name: "Beispiel · Stadthaus",
        address: "Musterstraße 12",
        location: "12345 Musterstadt · Innenstadt",
        contact: "Alex Muster",
        team: "Kaufmännische Verwaltung",
        people: [
            { id: "b", name: "Alex Muster" },
            { id: "e", name: "Sam Demo" },
            { id: "f", name: "Lou Muster" },
        ],
        tags: ["Projekt Beta", "Terminplanung", "Dokumentation"],
    },
    {
        id: 3,
        updated_at: "2026-11-14T09:00:00Z",
        name: "Beispiel · Gartenhof",
        address: "Demoweg 7",
        location: "12345 Musterstadt · West",
        contact: "Robin Demo",
        team: "Service",
        people: [{ id: "c", name: "Robin Demo" }],
        tags: ["Projekt Gamma"],
    },
];

export function CellTypesDemo() {
    return (
        <SectionCard
            title="Zelltypen im Zusammenspiel"
            description="Fiktive Beispieldaten · dieselben CellDefinition-Bausteine für API-Grids und kleine Lesetabellen. Lange Inhalte bleiben begrenzt; Avatar- und Tag-Gruppen zeigen weitere Einträge als +N."
        >
            <RecordTable
                columns={columns}
                rows={rows}
                label="Vorschau der Tabellenzelltypen"
            />
        </SectionCard>
    );
}
