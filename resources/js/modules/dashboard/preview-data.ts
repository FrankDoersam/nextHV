import type { BarDatum } from "@/components/blocks/bar-chart";
import type { AgendaEntry } from "@/components/blocks/dashboard-blocks";
export const monthlyPreview: BarDatum[] = [
    "Dez",
    "Jan",
    "Feb",
    "Mär",
    "Apr",
    "Mai",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Okt",
    "Nov",
].map((label, index) => ({
    label,
    value: [
        41800, 39600, 44700, 43200, 48200, 47400, 45200, 49100, 50300, 51700,
        53400, 56800,
    ][index],
    highlight: index === 11,
}));
const people = [
    { id: "ls", name: "Lena Sommer" },
    { id: "mk", name: "Max König" },
    { id: "aw", name: "Anna Weber" },
];
export const agendaPreview: AgendaEntry[] = [
    {
        time: "09:30",
        title: "Teamrunde Verwaltung",
        description: "Offene Vorgänge · 15 Min.",
        people,
    },
    {
        time: "11:00",
        title: "Wohnungsübergabe",
        description: "Lindenhöfe · Einheit 2.01",
        people: people.slice(0, 2),
    },
    {
        time: "14:30",
        title: "Abstimmung Instandhaltung",
        description: "Handwerker · 30 Min.",
        people: people.slice(2),
    },
];
