import type { CollectionSummaryDefinition } from "@/framework/types";
import { money, number } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { CircleAlert } from "lucide-react";

/** Compact, consistently sized REUI-style stats for the complete query scope. */
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
            className="@container/stats min-w-0 shrink-0 space-y-3"
        >
            {!!error && (
                <Alert variant="warning">
                    <CircleAlert />
                    <AlertDescription>
                        <span>Kennzahlen konnten nicht geladen werden.</span>
                        {retry && (
                            <Button variant="outline" size="sm" onClick={retry}>
                                Erneut laden
                            </Button>
                        )}
                    </AlertDescription>
                </Alert>
            )}
            <dl
                className={cn(
                    "grid grid-cols-2 gap-3 @min-[48rem]/stats:grid-cols-4",
                    refreshing && !loading && "opacity-70",
                )}
            >
                {definition.items.map(
                    ({ key, label, kind, suffix, icon: Icon, description }) => {
                        const formatted =
                            values?.[key] == null
                                ? "—"
                                : kind === "currency"
                                  ? money(values[key])
                                  : number(values[key], 2);
                        return (
                            <div
                                key={key}
                                className="min-w-0 rounded-xl border bg-muted/25 px-3.5 py-3 sm:px-4"
                            >
                                <dt className="flex min-w-0 items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                                    <span
                                        className="min-w-0 truncate"
                                        title={label}
                                    >
                                        {label}
                                    </span>
                                    {Icon && (
                                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-card text-foreground/70">
                                            <Icon
                                                aria-hidden
                                                className="size-3.5"
                                            />
                                        </span>
                                    )}
                                </dt>
                                <dd className="mt-2 flex min-h-7 min-w-0 items-baseline gap-1 font-semibold tracking-tight tabular-nums">
                                    <span
                                        className="min-w-0 truncate text-xl @min-[48rem]/stats:text-2xl"
                                        title={loading ? undefined : formatted}
                                    >
                                        {loading ? (
                                            <Skeleton className="h-7 w-24 max-w-full" />
                                        ) : (
                                            formatted
                                        )}
                                    </span>
                                    {suffix && !loading && (
                                        <span className="shrink-0 text-xs font-normal text-muted-foreground">
                                            {suffix}
                                        </span>
                                    )}
                                </dd>
                                {description && (
                                    <p
                                        className="mt-1.5 truncate text-[11px] leading-4 text-muted-foreground"
                                        title={description}
                                    >
                                        {description}
                                    </p>
                                )}
                            </div>
                        );
                    },
                )}
            </dl>
        </section>
    );
}
