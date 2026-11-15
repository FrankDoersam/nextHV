import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
export type TranslationParams = Record<string, string | number>;
export type TranslationMessage = string | { one: string; other: string };
export type TranslationCatalog = Record<string, TranslationMessage>;
export interface I18nAdapter {
    translate: (
        key: string,
        locale: string,
        params: TranslationParams,
    ) => string | undefined;
}
export const coreMessages: Record<string, TranslationCatalog> = {
    de: {
        cancel: "Abbrechen",
        close: "Schließen",
        save: "Speichern",
        saving: "Wird gespeichert …",
        next: "Weiter",
        back: "Zurück",
        checking: "Wird geprüft …",
        create: "{resource} anlegen",
        add: "Hinzufügen",
        edit: "Bearbeiten",
        delete: "Löschen",
        search: "Suchen",
        searchRecords: "Datensätze suchen",
        loading: "Wird geladen …",
        empty: "Noch keine Einträge",
        noMatches: "Keine Treffer",
        noMatchesDescription:
            "Für diese Suche und Filter wurden keine passenden Datensätze gefunden.",
        reset: "Suche und Filter zurücksetzen",
        filter: "Filter",
        group: "Gruppieren",
        columns: "Spalten",
        ascending: "Aufsteigend",
        descending: "Absteigend",
        perPage: "Zeilen pro Seite",
        previousPage: "Vorherige Seite",
        nextPage: "Nächste Seite",
        page: "Seite {page}",
        range: "{from}–{to} von {count}",
        selected: { one: "{count} ausgewählt", other: "{count} ausgewählt" },
        selectAll: "Alle Zeilen dieser Seite auswählen",
        selectRow: "Zeile auswählen",
        noOptions: "Keine passenden Optionen",
        clearFilters: "Filter zurücksetzen",
        import: "CSV importieren",
        importCount: {
            one: "{count} Datensatz importieren",
            other: "{count} Datensätze importieren",
        },
        importedCount: {
            one: "{count} Datensatz importiert",
            other: "{count} Datensätze importiert",
        },
        recordCount: { one: "{count} Datensatz", other: "{count} Datensätze" },
        preview: "Vorschau",
        audit: "Änderungsverlauf",
        retry: "Erneut versuchen",
        download: "Herunterladen",
    },
    en: {
        cancel: "Cancel",
        close: "Close",
        save: "Save",
        saving: "Saving …",
        next: "Next",
        back: "Back",
        checking: "Validating …",
        create: "Create {resource}",
        add: "Add",
        edit: "Edit",
        delete: "Delete",
        search: "Search",
        searchRecords: "Search records",
        loading: "Loading …",
        empty: "No records found",
        noMatches: "No results",
        noMatchesDescription: "No records match this search and these filters.",
        reset: "Reset search and filters",
        filter: "Filter",
        group: "Group",
        columns: "Columns",
        ascending: "Ascending",
        descending: "Descending",
        perPage: "Rows per page",
        previousPage: "Previous page",
        nextPage: "Next page",
        page: "Page {page}",
        range: "{from}–{to} of {count}",
        selected: { one: "{count} selected", other: "{count} selected" },
        selectAll: "Select all rows on this page",
        selectRow: "Select row",
        noOptions: "No matching options",
        clearFilters: "Clear filters",
        import: "Import CSV",
        importCount: {
            one: "Import {count} record",
            other: "Import {count} records",
        },
        importedCount: {
            one: "{count} record imported",
            other: "{count} records imported",
        },
        recordCount: { one: "{count} record", other: "{count} records" },
        preview: "Preview",
        audit: "Change history",
        retry: "Try again",
        download: "Download",
    },
};
export function createTranslator(
    locale: string,
    catalogs = coreMessages,
    fallback = "de",
    adapter?: I18nAdapter,
) {
    return (
        key: string,
        params: TranslationParams = {},
        defaultValue = "—",
    ): string => {
        const translated = adapter?.translate(key, locale, params);
        const message =
            translated ??
            catalogs[locale]?.[key] ??
            catalogs[fallback]?.[key] ??
            defaultValue;
        const template =
            typeof message === "string"
                ? message
                : new Intl.PluralRules(locale).select(Number(params.count)) ===
                    "one"
                  ? message.one
                  : message.other;
        return template.replace(/\{(\w+)\}/g, (match, name) =>
            Object.hasOwn(params, name) ? String(params[name]) : match,
        );
    };
}
function value(
    locale: string,
    setLocale: (locale: string) => void,
    catalogs = coreMessages,
    adapter?: I18nAdapter,
) {
    return {
        locale,
        setLocale,
        t: createTranslator(locale, catalogs, "de", adapter),
        number: (input: unknown, digits = 0) =>
            new Intl.NumberFormat(locale, {
                maximumFractionDigits: digits,
            }).format(Number(input ?? 0)),
        money: (input: unknown, currency = "EUR") =>
            new Intl.NumberFormat(locale, {
                style: "currency",
                currency,
            }).format(Number(input ?? 0)),
        date: (input: unknown) => {
            if (!input) return "—";
            const parsed = new Date(String(input).slice(0, 10) + "T12:00:00");
            return Number.isNaN(parsed.getTime())
                ? "—"
                : new Intl.DateTimeFormat(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                  }).format(parsed);
        },
    };
}
const I18nContext = createContext(value("de", () => {}));
export function I18nProvider({
    children,
    messages = {},
    adapter,
    initialLocale = "de",
    locales = ["de", "en"],
    storageKey = "nexthv:locale",
}: {
    children: ReactNode;
    messages?: Record<string, TranslationCatalog>;
    adapter?: I18nAdapter;
    initialLocale?: string;
    locales?: string[];
    storageKey?: string;
}) {
    const [locale, updateLocale] = useState(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved && locales.includes(saved)) return saved;
        } catch {
            /* Storage may be disabled. */
        }
        return locales.includes(initialLocale) ? initialLocale : "de";
    });
    const setLocale = (next: string) => {
        if (locales.includes(next)) updateLocale(next);
    };
    useEffect(() => {
        document.documentElement.lang = locale;
        try {
            localStorage.setItem(storageKey, locale);
        } catch {
            /* Locale still works for this session. */
        }
    }, [locale, storageKey]);
    const context = useMemo(
        () =>
            value(
                locale,
                setLocale,
                Object.fromEntries(
                    [
                        ...new Set([
                            ...Object.keys(coreMessages),
                            ...Object.keys(messages),
                        ]),
                    ].map((name) => [
                        name,
                        { ...coreMessages[name], ...messages[name] },
                    ]),
                ),
                adapter,
            ),
        [locale, messages, adapter, locales.join("|")],
    );
    return (
        <I18nContext.Provider value={context}>{children}</I18nContext.Provider>
    );
}
export const useI18n = () => useContext(I18nContext);
export function useGridI18n() {
    const { t } = useI18n();
    return {
        labels: {
            filterSelectedCount: (count: number) => t("selected", { count }),
            filterNoResults: t("noOptions"),
            filterClear: t("clearFilters"),
            selectAll: t("selectAll"),
            selectRow: t("selectRow"),
            empty: t("empty"),
            loading: t("loading"),
            rowsPerPage: t("perPage"),
            previousPage: t("previousPage"),
            nextPage: t("nextPage"),
            paginationInfo: (values: {
                from: number;
                to: number;
                count: number;
            }) => t("range", values),
            goToPage: (page: number) => t("page", { page }),
            toggleColumns: t("columns"),
            columnsMenu: t("columns"),
            sortAscending: t("ascending"),
            sortDescending: t("descending"),
        },
    };
}
