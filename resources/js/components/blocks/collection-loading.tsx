import { Skeleton } from "@/components/ui/skeleton";
import { CollectionSurface } from "./collection-surface";
import { CollectionKpis } from "./collection-kpis";
import { ResponsiveTabList } from "./responsive-tab-list";
import { Tabs } from "@/components/ui/tabs";
import { CollectionPage, PageHeader } from "./layout";
import type { ResourceDefinition } from "@/framework/types";
export function GridCellSkeleton({
    kind = "text",
    dense = false,
}: {
    dense?: boolean;
    kind?:
        | "text"
        | "number"
        | "currency"
        | "date"
        | "badge"
        | "selection"
        | "actions";
}) {
    return (
        <div
            data-slot="grid-cell-skeleton"
            className={
                dense
                    ? "flex h-5 min-w-0 items-center"
                    : "flex h-7 min-w-0 items-center"
            }
        >
            <Skeleton
                className={
                    kind === "selection"
                        ? "size-4 rounded-sm"
                        : kind === "actions"
                          ? "ml-auto h-4 w-5"
                          : kind === "badge"
                            ? "h-5 w-20 rounded-full"
                            : kind === "number" || kind === "currency"
                              ? "ml-auto h-4 w-16"
                              : "h-4 w-3/4 max-w-48"
                }
            />
        </div>
    );
}
/** Route chunk fallback follows the actual collection structure instead of unrelated loading bars. */
export function CollectionLoading({
    resource,
    activeView,
}: {
    resource: ResourceDefinition;
    activeView?: string | null;
}) {
    const selectedView =
        resource.views?.find((view) => view.id === activeView)?.id ??
        resource.views?.[0]?.id ??
        "";
    return (
        <CollectionPage>
            <PageHeader title={resource.label} />
            <div className="flex min-w-0 flex-col gap-4 md:min-h-0 md:flex-1">
                <CollectionSurface
                    summary={
                        resource.summary ? (
                            <CollectionKpis
                                definition={resource.summary}
                                loading
                            />
                        ) : undefined
                    }
                    navigation={
                        resource.views?.length ? (
                            <Tabs value={selectedView}>
                                <ResponsiveTabList
                                    tabs={resource.views.map(
                                        ({ id, label, icon }) => ({
                                            id,
                                            label,
                                            icon,
                                        }),
                                    )}
                                    active={selectedView}
                                    onChange={() => {}}
                                    ariaLabel={`${resource.label} Ansichten`}
                                />
                            </Tabs>
                        ) : undefined
                    }
                >
                    <div
                        role="status"
                        aria-label="Tabelle wird geladen"
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
                            <Skeleton className="h-9 w-full sm:w-64" />
                            <Skeleton className="h-9 w-24" />
                            <Skeleton className="ml-auto h-9 w-28" />
                        </div>
                        <div
                            data-slot="collection-loading-table"
                            className="min-h-64 flex-1 overflow-hidden md:min-h-0"
                        >
                            <Skeleton className="h-10 rounded-none" />
                            {Array.from({ length: 12 }, (_, i) => (
                                <div
                                    key={i}
                                    className="flex h-11 items-center gap-6 border-b px-4"
                                >
                                    <Skeleton className="size-4" />
                                    {[1, 2, 3, 4].map((n) => (
                                        <Skeleton
                                            key={n}
                                            className="h-4 flex-1"
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="flex shrink-0 justify-end gap-3 border-t p-3">
                            <Skeleton className="h-8 w-16" />
                            <Skeleton className="h-8 w-32" />
                        </div>
                        <span className="sr-only">
                            {resource.label} werden geladen.
                        </span>
                    </div>
                </CollectionSurface>
            </div>
        </CollectionPage>
    );
}
