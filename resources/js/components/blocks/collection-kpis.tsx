import type { CollectionSummaryDefinition } from "@/framework/types";
import { money, number } from "@/lib/format";
import { MetricCard, MetricCardGrid } from "./metric-card";
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
            <div className={cn(refreshing && !loading && "opacity-70")}>
                <MetricCardGrid>
                    {definition.items.map(
                        ({ key, label, kind, suffix, icon, description }) => (
                            <MetricCard
                                key={key}
                                label={label}
                                icon={icon}
                                suffix={suffix}
                                loading={loading}
                                value={
                                    values?.[key] == null
                                        ? "—"
                                        : kind === "currency"
                                          ? money(values[key])
                                          : number(values[key], 2)
                                }
                                hint={description}
                            />
                        ),
                    )}
                </MetricCardGrid>
            </div>
        </section>
    );
}
