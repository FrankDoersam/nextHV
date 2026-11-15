import type { CollectionSummaryDefinition } from "@/framework/types";
import { useI18n } from "@/framework/i18n";
import { MetricCard } from "./metric-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { CircleAlert } from "lucide-react";

/** Divided stats embedded in the collection header, without separate card frames. */
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
    const { money, number } = useI18n();
    return (
        <section
            data-slot="collection-kpis"
            aria-label="Kennzahlen der gefilterten Auswahl"
            aria-busy={refreshing}
            className="@container/stats min-w-0 shrink-0"
        >
            {!!error && (
                <Alert variant="warning" className="m-3 sm:m-4">
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
            <div
                className={cn(
                    "grid grid-cols-2 gap-px bg-border @min-[40rem]/stats:grid-cols-4",
                    refreshing && !loading && "opacity-70",
                )}
            >
                {definition.items.map(
                    ({ key, label, kind, suffix, icon, description }) => (
                        <MetricCard
                            key={key}
                            density="compact"
                            appearance="inset"
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
                            description={description}
                        />
                    ),
                )}
            </div>
        </section>
    );
}
