import { useInfiniteQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { request } from "@/framework/data/http";
import { resourceKey } from "@/framework/data/resource-key";
import { useI18n } from "@/framework/i18n";
import type { ResourceDefinition } from "@/framework/types";
import { Button } from "@/components/ui/button";
import { ErrorState, Loading, EmptyState, SectionCard } from "./content";
import type { LazyTab } from "./lazy-tabs";
interface AuditPage {
    data: {
        id: number;
        event: string;
        actor: string;
        created_at: string;
        changes: { label: string; before: unknown; after: unknown }[];
    }[];
    next_cursor: number | null;
}
export function AuditTimeline({
    resource,
    id,
}: {
    resource: ResourceDefinition;
    id: number;
}) {
    const { t, locale } = useI18n();
    const query = useInfiniteQuery({
        queryKey: [...resourceKey(resource), "audit", id],
        enabled: !!resource.features?.audit && id > 0,
        initialPageParam: null as number | null,
        queryFn: ({ signal, pageParam }) =>
            request<AuditPage>(
                `/api/v1/resource-features/${resource.name}/${id}/audit${pageParam ? `?before=${pageParam}` : ""}`,
                undefined,
                "GET",
                signal,
            ),
        getNextPageParam: (page) => page.next_cursor ?? undefined,
    });
    if (!resource.features?.audit) return null;
    if (query.isPending) return <Loading />;
    const events = query.data?.pages.flatMap((page) => page.data) ?? [];
    const titles: Record<string, string> = {
        created: t("auditCreated", {}, "Angelegt"),
        updated: t("auditUpdated", {}, "Geändert"),
        deleted: t("auditDeleted", {}, "Gelöscht"),
        restored: t("auditRestored", {}, "Wiederhergestellt"),
    };
    const display = (value: unknown) =>
        value == null || value === ""
            ? "—"
            : typeof value === "boolean"
              ? value
                  ? t("yes", {}, "Ja")
                  : t("no", {}, "Nein")
              : String(value);
    return (
        <SectionCard title={t("audit")}>
            {query.isError && (
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            )}
            {!events.length && !query.isError && (
                <EmptyState
                    title={t(
                        "auditEmpty",
                        {},
                        "Noch keine Änderungen protokolliert",
                    )}
                    description={t(
                        "auditStartsNow",
                        {},
                        "Der Verlauf beginnt mit der Aktivierung dieser Funktion.",
                    )}
                />
            )}
            <ol className="divide-y" aria-label={t("audit")}>
                {events.map((event) => (
                    <li key={event.id} className="flex gap-3 py-4 first:pt-0">
                        <History
                            className="mt-1 size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <p className="text-sm font-medium">
                                    {titles[event.event] ?? event.event} ·{" "}
                                    {event.actor}
                                </p>
                                <time
                                    dateTime={event.created_at}
                                    className="text-xs text-muted-foreground"
                                >
                                    {new Intl.DateTimeFormat(locale, {
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                    }).format(new Date(event.created_at))}
                                </time>
                            </div>
                            <dl className="space-y-2">
                                {event.changes.map((change, index) => (
                                    <div
                                        key={index}
                                        className="grid gap-1 text-sm sm:grid-cols-[minmax(8rem,1fr)_2fr]"
                                    >
                                        <dt className="text-muted-foreground">
                                            {change.label}
                                        </dt>
                                        <dd className="min-w-0 break-words">
                                            <span className="text-muted-foreground">
                                                {display(change.before)}
                                            </span>
                                            <span aria-hidden> → </span>
                                            <span>{display(change.after)}</span>
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    </li>
                ))}
            </ol>
            {query.hasNextPage && (
                <Button
                    variant="outline"
                    disabled={query.isFetchingNextPage}
                    onClick={() => void query.fetchNextPage()}
                >
                    {query.isFetchingNextPage
                        ? t("loading")
                        : t("loadMore", {}, "Weitere Änderungen laden")}
                </Button>
            )}
        </SectionCard>
    );
}
/** A single opt-in adds a lazy tab to any resource detail page. */
export function auditTabs(resource: ResourceDefinition, id: number): LazyTab[] {
    return resource.features?.audit
        ? [
              {
                  id: "audit",
                  label: "Änderungsverlauf",
                  icon: History,
                  render: () => <AuditTimeline resource={resource} id={id} />,
              },
          ]
        : [];
}
