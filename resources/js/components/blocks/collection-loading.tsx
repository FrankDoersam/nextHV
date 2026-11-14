import { Skeleton } from "@/components/ui/skeleton";
import { ContentCard } from "./content-card";
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
}: {
    resource: ResourceDefinition;
}) {
    return (
        <CollectionPage>
            <PageHeader title={resource.label} />
            <ContentCard grow>
                <div
                    role="status"
                    aria-label="Tabelle wird geladen"
                    className="flex min-h-0 flex-1 flex-col gap-4"
                >
                    {resource.summary && (
                        <div className="grid grid-cols-2 gap-6 border-b pb-4 lg:grid-cols-4">
                            {resource.summary.items.map((item) => (
                                <div key={item.key} className="space-y-3">
                                    <Skeleton className="h-3 w-24" />
                                    <Skeleton className="h-8 w-32" />
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-72" />
                        <Skeleton className="h-9 w-24" />
                        <Skeleton className="ml-auto h-9 w-36" />
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
                        <Skeleton className="h-10 rounded-none" />
                        {Array.from({ length: 12 }, (_, i) => (
                            <div
                                key={i}
                                className="flex h-11 items-center gap-6 border-b px-4"
                            >
                                <Skeleton className="size-4" />
                                {[1, 2, 3, 4].map((n) => (
                                    <Skeleton key={n} className="h-4 flex-1" />
                                ))}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between border-t pt-3">
                        <Skeleton className="h-8 w-44" />
                        <Skeleton className="h-8 w-32" />
                    </div>
                    <span className="sr-only">
                        {resource.label} werden geladen.
                    </span>
                </div>
            </ContentCard>
        </CollectionPage>
    );
}
