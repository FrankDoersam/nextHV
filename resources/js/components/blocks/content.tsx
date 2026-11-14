import { KeyValueRows } from "./key-value-rows";
import { Cell } from "./cell";
import {
    Alert,
    AlertTitle,
    AlertDescription,
    AlertAction,
} from "@/components/reui/alert";
import { ApiError } from "@/framework/data/http";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { label } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    ArrowUpRight,
    Building2,
    Inbox,
    RefreshCw,
    TriangleAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
export { ContentCard as SectionCard } from "./content-card";
export function StatusBadge({
    value,
    displayLabel,
}: {
    value: unknown;
    displayLabel?: string;
}) {
    return (
        <Badge
            variant="secondary"
            title={displayLabel ?? label(value)}
            className={cn(
                "max-w-full gap-1.5 font-medium",
                ["active", "ready", "received"].includes(String(value))
                    ? "bg-primary/10 text-primary"
                    : ["maintenance", "outstanding", "draft"].includes(
                            String(value),
                        )
                      ? "bg-amber-50 text-amber-800"
                      : "",
            )}
        >
            <span className="size-1.5 shrink-0 rounded-full bg-current" />
            <span className="truncate">{displayLabel ?? label(value)}</span>
        </Badge>
    );
}
export function Loading({ rows = 3 }: { rows?: number }) {
    return (
        <div role="status" aria-label="Wird geladen" className="space-y-4">
            {Array.from({ length: rows }, (_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
        </div>
    );
}
export function EmptyState({
    title = "Noch keine Einträge",
    description = "Lege den ersten Datensatz an.",
    action,
}: {
    title?: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="rounded-2xl bg-muted p-4 text-muted-foreground">
                <Inbox size={24} />
            </span>
            <h3 className="font-semibold">{title}</h3>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
                {description}
            </p>
            {action}
        </div>
    );
}
export function ErrorState({
    error,
    retry,
}: {
    error: unknown;
    retry?: () => void;
}) {
    const messages = [
        ...new Set(
            error instanceof ApiError && Object.keys(error.errors).length
                ? Object.values(error.errors).flat()
                : [error instanceof Error ? error.message : String(error)],
        ),
    ];
    return (
        <Alert variant="destructive" className="items-start py-4">
            <TriangleAlert />
            <AlertTitle className="line-clamp-none">
                {messages.length > 1
                    ? `${messages.length} Hinweise benötigen deine Aufmerksamkeit`
                    : "Bitte prüfe diese Angabe"}
            </AlertTitle>
            <AlertDescription>
                <ul className="space-y-1.5 break-words">
                    {messages.map((message, i) => (
                        <li key={i}>{message}</li>
                    ))}
                </ul>
            </AlertDescription>
            {retry && (
                <AlertAction>
                    <Button variant="outline" size="sm" onClick={retry}>
                        <RefreshCw />
                        Erneut versuchen
                    </Button>
                </AlertAction>
            )}
        </Alert>
    );
}

export function MetricGrid({
    items,
    compact = false,
}: {
    compact?: boolean;
    items: { label: string; value: string; hint?: string; accent?: boolean }[];
}) {
    return (
        <div
            className={cn(
                "grid gap-4 sm:grid-cols-2 xl:grid-cols-4",
                compact && "max-h-44 overflow-y-auto sm:max-h-none",
            )}
        >
            {items.map((item) => (
                <Card
                    key={item.label}
                    className={cn(
                        compact ? "gap-1 py-3" : "gap-2",
                        item.accent && "border-primary/20 bg-primary/5",
                    )}
                >
                    <CardContent>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            {item.label}
                            <ArrowUpRight
                                className={
                                    item.accent
                                        ? "text-primary"
                                        : "text-muted-foreground/50"
                                }
                                size={15}
                            />
                        </div>
                        <div
                            className={cn(
                                "font-semibold tracking-tight tabular-nums",
                                compact ? "mt-1 text-xl" : "mt-3 text-[28px]",
                            )}
                        >
                            {item.value}
                        </div>
                        {item.hint && (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                                {item.hint}
                            </p>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
export function DetailList({
    items,
}: {
    items: { label: string; value: ReactNode }[];
}) {
    return (
        <KeyValueRows
            items={items.map((item, index) => ({ ...item, id: String(index) }))}
        />
    );
}

export function DynamicList<T>({
    items,
    search = false,
    searchText,
    renderItem,
    getKey,
    empty,
    actions,
}: {
    items: T[];
    search?: boolean;
    searchText: (item: T) => string;
    renderItem: (item: T) => ReactNode;
    getKey: (item: T) => string | number;
    empty?: ReactNode;
    actions?: ReactNode;
}) {
    const [query, setQuery] = useState("");
    const filtered = items.filter((i) =>
        searchText(i)
            .toLocaleLowerCase("de")
            .includes(query.toLocaleLowerCase("de")),
    );
    return (
        <div>
            {(search || actions) && (
                <div className="mb-4 flex items-center gap-3">
                    {search && (
                        <Input
                            aria-label="Liste durchsuchen"
                            placeholder="Liste durchsuchen …"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    )}{" "}
                    {actions}
                </div>
            )}
            <ul className="divide-y">
                {filtered.map((i) => (
                    <li key={getKey(i)} className="py-3 first:pt-0 last:pb-0">
                        {renderItem(i)}
                    </li>
                ))}
            </ul>
            {!filtered.length &&
                (empty ?? (
                    <EmptyState
                        title="Keine passenden Einträge"
                        description="Passe die Suche an."
                    />
                ))}
        </div>
    );
}
export function ListRow({
    title,
    description,
    trailing,
    icon,
    onClick,
}: {
    title: string;
    description?: string;
    trailing?: ReactNode;
    icon?: ReactNode;
    onClick?: () => void;
}) {
    return (
        <div className="flex items-center gap-3">
            {icon && (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                    {icon}
                </span>
            )}
            <div className="min-w-0 flex-1">
                {onClick ? (
                    <Cell onClick={onClick} className="text-sm">
                        {title}
                    </Cell>
                ) : (
                    <p className="text-sm font-medium">{title}</p>
                )}
                {description && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            {trailing}
        </div>
    );
}
export function WelcomeBanner({
    title,
    description,
    action,
}: {
    title: string;
    description: string;
    action?: ReactNode;
}) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-primary/[.055] px-6 py-7 lg:px-8">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
                <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-primary">
                        Ein guter Überblick. Ein klarer nächster Schritt.
                    </p>
                    <h2 className="text-xl font-semibold tracking-tight">
                        {title}
                    </h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                        {description}
                    </p>
                </div>
                {action}
            </div>
            <Building2
                className="pointer-events-none absolute -right-5 -bottom-8 size-44 text-primary/[.04]"
                strokeWidth={1}
            />
        </div>
    );
}
export function Occupancy({
    occupied,
    total,
}: {
    occupied: number;
    total: number;
}) {
    return (
        <div>
            <div className="mb-3 flex items-baseline justify-between">
                <span className="text-3xl font-semibold tracking-tight">
                    {total ? Math.round((occupied / total) * 100) : 0}%
                </span>
                <span className="text-xs text-muted-foreground">
                    {occupied} von {total} Einheiten
                </span>
            </div>
            <div className="flex h-2 gap-1 overflow-hidden rounded-full">
                <div
                    className="bg-primary"
                    style={{
                        width: `${total ? (occupied / total) * 100 : 0}%`,
                    }}
                />
                <div className="flex-1 bg-amber-200" />
            </div>
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>Vermietet</span>
                <span>{total - occupied} ohne laufenden Vertrag</span>
            </div>
        </div>
    );
}
