import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useDebounced } from "@/framework/data/hooks";
import { request } from "@/framework/data/http";
import { useI18n } from "@/framework/i18n";
import {
    Command,
    CommandDialog,
    CommandInput,
    CommandList,
    CommandItem,
    CommandGroup,
} from "@/components/ui/command";
import { ErrorState } from "./content";
type SearchGroup = {
    resource: string;
    label: string;
    total: number;
    items: { id: number; title: string; subtitle: string; url: string }[];
};
export function GlobalSearch({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [input, setInput] = useState("");
    const term = input.trim();
    const query = useDebounced(term);
    useEffect(() => {
        if (!open) setInput("");
    }, [open]);
    const result = useQuery({
        queryKey: ["global-search", query],
        enabled:
            open && query.length >= 2 && query.length <= 100 && query === term,
        queryFn: ({ signal }) =>
            request<{ data: SearchGroup[] }>(
                "/api/v1/global-search",
                { query },
                "POST",
                signal,
            ),
        // Reopening search must see records created/imported since the last search.
        staleTime: 0,
        gcTime: 60_000,
        retry: false,
    });
    const ready = term === query && term.length >= 2;
    const groups = ready
        ? (result.data?.data.filter((group) => group.items.length) ?? [])
        : [];
    const go = (path: string) => {
        onOpenChange(false);
        navigate(path);
    };
    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("searchRecords")}
            description={t(
                "globalSearchDescription",
                {},
                "Suche nach Objekten, Einheiten, Geschäftspartnern und Verträgen.",
            )}
            showCloseButton
            className="sm:max-w-xl"
        >
            <Command shouldFilter={false} label={t("searchRecords")}>
                <CommandInput
                    value={input}
                    onValueChange={setInput}
                    maxLength={100}
                    placeholder={t("searchRecords")}
                    aria-label={t("searchRecords")}
                />
                <CommandList aria-busy={result.isFetching || query !== term}>
                    {term.length < 2 ? (
                        <p className="p-4 text-sm text-muted-foreground">
                            {t(
                                "searchMinimum",
                                {},
                                "Mindestens zwei Zeichen eingeben.",
                            )}
                        </p>
                    ) : result.isFetching || query !== term ? (
                        <p
                            role="status"
                            className="p-4 text-sm text-muted-foreground"
                        >
                            {t("loading")}
                        </p>
                    ) : result.isError ? (
                        <ErrorState
                            error={result.error}
                            retry={() => void result.refetch()}
                        />
                    ) : !groups.length ? (
                        <p className="p-4 text-sm text-muted-foreground">
                            {t("noMatches")}
                        </p>
                    ) : (
                        groups.map((group) => (
                            <CommandGroup
                                key={group.resource}
                                heading={`${group.label} · ${group.total}`}
                            >
                                {group.items.map((item) => (
                                    <CommandItem
                                        key={item.id}
                                        value={`${group.resource}:${item.id}`}
                                        onSelect={() => go(item.url)}
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">
                                                {item.title}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {item.subtitle}
                                            </p>
                                        </div>
                                    </CommandItem>
                                ))}
                                {group.total > group.items.length && (
                                    <CommandItem
                                        value={`${group.resource}:all`}
                                        onSelect={() =>
                                            go(
                                                `/${group.resource}?q=${encodeURIComponent(query)}`,
                                            )
                                        }
                                    >
                                        {t(
                                            "allResults",
                                            { count: group.total },
                                            "Alle {count} Treffer anzeigen",
                                        )}
                                    </CommandItem>
                                )}
                            </CommandGroup>
                        ))
                    )}
                </CommandList>
            </Command>
        </CommandDialog>
    );
}
