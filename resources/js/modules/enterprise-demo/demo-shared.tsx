import type { ReactNode } from "react";
import {
    Building2,
    CalendarDays,
    FlaskConical,
    WalletCards,
} from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/blocks/layout";
import { Badge } from "@/components/reui/badge";
import type { FilterQuery } from "@/components/reui/filters/filters-types";
import { SheetSection } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { demoAsOfLabel } from "./demo-data";

export function demoQuery(
    path: string,
    operator: string,
    value: unknown,
): FilterQuery {
    return {
        id: "root",
        type: "group",
        combinator: "and",
        rules: [
            {
                id: `preset-${path}`,
                type: "rule",
                path: [path],
                operator,
                value,
            },
        ],
    };
}

export function EnterpriseDemoHeader({
    kind,
}: {
    kind: "properties" | "payments";
}) {
    return (
        <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <nav
                    aria-label="Enterprise-Demos"
                    className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border bg-muted/30 p-1"
                >
                    {[
                        {
                            id: "properties",
                            title: "Objekte / Einheiten",
                            href: "/enterprise-demo/objekte-einheiten",
                            icon: Building2,
                        },
                        {
                            id: "payments",
                            title: "Zahlungen / OP",
                            href: "/enterprise-demo/zahlungen-op",
                            icon: WalletCards,
                        },
                    ].map(({ id, title, href, icon: Icon }) => (
                        <Link
                            key={id}
                            to={href}
                            aria-current={kind === id ? "page" : undefined}
                            className={cn(
                                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                kind === id
                                    ? "bg-background text-foreground shadow-xs"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                        >
                            <Icon className="size-3.5" aria-hidden="true" />
                            {title}
                        </Link>
                    ))}
                </nav>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="warning-light" radius="full">
                        <FlaskConical aria-hidden="true" />
                        Dummy-Daten
                    </Badge>
                    <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        Stichtag {demoAsOfLabel}
                    </span>
                </div>
            </div>
            <PageHeader
                title={
                    kind === "properties"
                        ? "Objekte & Einheiten"
                        : "Zahlungen & offene Posten"
                }
                description={
                    kind === "properties"
                        ? "Ihr Portfolio im Überblick: Vermietung, Flächen und Mietpotenzial bis auf die einzelne Einheit."
                        : "Forderungen, Zahlungseingänge und Rückstände gemeinsam im Blick – mit vollständiger Zahlungshistorie je Posten."
                }
            />
        </div>
    );
}

export function DemoDetailSection({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return <SheetSection title={<h3>{title}</h3>}>{children}</SheetSection>;
}

export function DemoDetailField({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium">{children}</dd>
        </div>
    );
}
