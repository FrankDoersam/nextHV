import { useQueries } from "@tanstack/react-query";
import { Tabs } from "@/components/ui/tabs";
import { ResponsiveTabList } from "@/components/blocks/responsive-tab-list";
import { dataProvider } from "../data/provider";
import type {
    CollectionViewDefinition,
    Filter,
    ResourceDefinition,
} from "../types";
export const collectionViewTabId = (panelId: string, viewId: string) =>
    `${panelId}-view-${encodeURIComponent(viewId)}`;
/** Shared count cache for collection tabs and sidebar badges. */
export const viewCountQuery = (
    resource: ResourceDefinition,
    view: CollectionViewDefinition,
    fixedFilters: Filter[] = [],
) => ({
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
                { ...resource, includes: undefined, aggregates: undefined },
                {
                    limit: 10,
                    query: view.query,
                    filters: [...fixedFilters, ...(view.filters ?? [])],
                },
                signal,
            )
        ).total,
});

/** Counts use the fixed relation scope plus the view query, independent of user chips/paging. */
export function CollectionViews({
    resource,
    views,
    active,
    fixedFilters,
    panelId,
    onChange,
    icons = true,
}: {
    resource: ResourceDefinition;
    views: CollectionViewDefinition[];
    active: string;
    fixedFilters: Filter[];
    panelId: string;
    icons?: boolean;
    onChange: (view: string) => void;
}) {
    const counts = useQueries({
        queries: views.map((view) =>
            viewCountQuery(resource, view, fixedFilters),
        ),
    });
    return (
        <Tabs
            value={active}
            onValueChange={(v) => onChange(String(v))}
            className="min-w-0 shrink-0"
        >
            <ResponsiveTabList
                active={active}
                onChange={onChange}
                icons={icons}
                ariaLabel={`${resource.label} Ansichten`}
                moreLabel="Weitere Ansichten"
                panelId={panelId}
                tabs={views.map((view, index) => ({
                    id: view.id,
                    label: view.label,
                    icon: view.icon,
                    count: view.count ? counts[index].data : undefined,
                    domId: collectionViewTabId(panelId, view.id),
                }))}
            />
        </Tabs>
    );
}
