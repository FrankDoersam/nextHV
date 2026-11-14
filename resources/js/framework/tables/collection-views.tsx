import { useQueries } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { dataProvider } from "../data/provider";
import type {
    CollectionViewDefinition,
    Filter,
    ResourceDefinition,
} from "../types";
export const collectionViewTabId = (panelId: string, viewId: string) =>
    `${panelId}-view-${encodeURIComponent(viewId)}`;

/** Counts use the fixed relation scope plus the view query, independent of user chips/paging. */
export function CollectionViews({
    resource,
    views,
    active,
    fixedFilters,
    panelId,
    onChange,
}: {
    resource: ResourceDefinition;
    views: CollectionViewDefinition[];
    active: string;
    fixedFilters: Filter[];
    panelId: string;
    onChange: (view: string) => void;
}) {
    const counts = useQueries({
        queries: views.map((view) => ({
            queryKey: [
                "resources",
                resource.name,
                "view-count",
                view.id,
                fixedFilters,
                view.filters,
                view.query,
            ],
            enabled: !!view.count,
            staleTime: 30_000,
            queryFn: async ({ signal }: { signal: AbortSignal }) =>
                (
                    await dataProvider.list(
                        {
                            ...resource,
                            includes: undefined,
                            aggregates: undefined,
                        },
                        {
                            limit: 10,
                            query: view.query,
                            filters: [...fixedFilters, ...(view.filters ?? [])],
                        },
                        signal,
                    )
                ).total,
        })),
    });
    return (
        <Tabs
            value={active}
            onValueChange={(v) => onChange(String(v))}
            className="min-w-0 shrink-0"
        >
            <div className="min-w-0 overflow-x-auto border-b">
                <TabsList
                    variant="line"
                    aria-label={`${resource.label} Ansichten`}
                    className="h-10 min-w-max"
                >
                    {views.map((view, i) => (
                        <TabsTrigger
                            key={view.id}
                            value={view.id}
                            id={collectionViewTabId(panelId, view.id)}
                            aria-controls={panelId}
                        >
                            {view.label}
                            {view.count &&
                                (counts[i].isPending ? (
                                    <Skeleton className="h-4 w-6" />
                                ) : (
                                    <span
                                        className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] leading-4 tabular-nums"
                                        title={
                                            counts[i].error
                                                ? "Anzahl derzeit nicht verfügbar"
                                                : undefined
                                        }
                                    >
                                        {counts[i].data ?? "—"}
                                    </span>
                                ))}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>
        </Tabs>
    );
}
