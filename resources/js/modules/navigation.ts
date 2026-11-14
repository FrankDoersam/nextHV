import type { NavigationGroupSettings } from "@/framework/navigation/sidebar-model";
import { Building2, KeyRound, Files, Settings2 } from "lucide-react";

/** Enterprise navigation defaults; resource definitions own their own child links and filters. */
export const navigationGroups: Record<string, NavigationGroupSettings> = {
    Stammdaten: {
        icon: Building2,
        defaultOpen: true,
        tooltip: "Objekte, Einheiten und Geschäftspartner",
        description: "Grundlagen der Immobilienverwaltung",
    },
    Vermietung: {
        icon: KeyRound,
        defaultOpen: true,
        tooltip: "Verträge, Mietkonditionen und Kündigungen",
    },
    Dokumente: {
        icon: Files,
        defaultOpen: false,
        tooltip: "Digitale Akten und Dokumente",
    },
    Verwaltung: {
        icon: Settings2,
        defaultOpen: false,
        tooltip: "Weitere Verwaltungsbereiche",
    },
};
