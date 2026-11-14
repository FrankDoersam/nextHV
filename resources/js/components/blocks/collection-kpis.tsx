import type { CollectionSummaryDefinition } from "@/framework/types";
import { money, number } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Server rollups for the complete search scope, independent of table pagination. */
export function CollectionKpis({
    definition,
    values,
    loading,
    refreshing,
    error,
    retry,
}: {
    definition: CollectionSummaryDefinition;
    values?: Record<string, number | null>;
    loading?: boolean;
    refreshing?: boolean;
    error?: unknown;
    retry?: () => void;
}) {
    return (
        <section
            data-slot="collection-kpis"
            aria-label="Kennzahlen der gefilterten Auswahl"
            aria-busy={refreshing}
            className="shrink-0 border-b pb-4"
        >
            {error ? (
                <div
                    role="alert"
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm"
                >
                    <span>Kennzahlen konnten nicht geladen werden.</span>
                    <Button variant="outline" size="sm" onClick={retry}>
                        Erneut laden
                    </Button>
                </div>
            ) : (
                <dl
                    className={cn(
                        "grid grid-cols-2 gap-y-4 lg:flex",
                        refreshing && !loading && "opacity-60",
                    )}
                >
                    {definition.items.map(
                        (
                            {
                                key,
                                label,
                                kind,
                                suffix,
                                icon: Icon,
                                description,
                            },
                            index,
                        ) => (
                            <div
                                key={key}
                                className={cn(
                                    "min-w-0 flex-1 px-4 first:pl-0",
                                    index % 2 === 1 && "border-l",
                                    index > 0 && "lg:border-l",
                                )}
                            >
                                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                    {Icon && (
                                        <Icon
                                            aria-hidden
                                            className="size-3.5 shrink-0"
                                        />
                                    )}
                                    <span className="truncate">{label}</span>
                                </dt>
                                <dd className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums">
                                    {loading ? (
                                        <Skeleton className="h-8 w-24" />
                                    ) : values?.[key] == null ? (
                                        "—"
                                    ) : (
                                        <>
                                            {kind === "currency"
                                                ? money(values[key])
                                                : number(values[key], 2)}
                                            {suffix && (
                                                <span className="ml-1 text-sm font-normal text-muted-foreground">
                                                    {suffix}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </dd>
                                {description && (
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                        {description}
                                    </p>
                                )}
                            </div>
                        ),
                    )}
                </dl>
            )}
        </section>
    );
}
