import type { NavigationGroupSettings } from "@/framework/navigation/sidebar-model";

/** Enterprise navigation defaults; resource definitions own their own child links and filters. */
export const navigationGroups: Record<string, NavigationGroupSettings> = {
    Stammdaten: {
        defaultOpen: true,
        tooltip: "Objekte, Einheiten und Geschäftspartner",
        description: "Grundlagen der Immobilienverwaltung",
    },
    Vermietung: {
        defaultOpen: false,
        tooltip: "Verträge, Mietkonditionen und Kündigungen",
    },
    Dokumente: {
        defaultOpen: false,
        tooltip: "Digitale Akten und Dokumente",
    },
    Verwaltung: {
        defaultOpen: false,
        tooltip: "Weitere Verwaltungsbereiche",
    },
};
