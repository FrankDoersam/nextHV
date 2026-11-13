import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { can } from "@/framework/permissions";
import type { ResourceDefinition } from "@/framework/types";
import { cn } from "@/lib/utils";
import {
    Building2,
    ChevronRight,
    LogOut,
    Menu,
    PanelLeftClose,
    ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
export function Brand() {
    return (
        <Link
            to="/"
            className="flex items-center gap-2.5 text-xl font-semibold tracking-tight"
        >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Building2 size={21} />
            </span>
            next<span className="-ml-2 text-primary">HV</span>
        </Link>
    );
}
export function AppShell({
    resources,
    user,
    onLogout,
    children,
}: {
    resources: ResourceDefinition[];
    user: { name: string; email: string };
    onLogout: () => void;
    children: ReactNode;
}) {
    const [mobile, setMobile] = useState(false);
    const [compact, setCompact] = useState(false);
    const location = useLocation();
    const nav = (
        <>
            <div className="px-6 py-7">
                <Brand />
            </div>
            <div className="px-6 pb-6">
                <div className="rounded-xl border bg-muted/40 px-3 py-2.5 text-xs">
                    <p className="font-semibold">Meine Hausverwaltung</p>
                    <p className="mt-1 text-muted-foreground">
                        Immobilien. Einfach im Blick.
                    </p>
                </div>
            </div>
            <nav
                aria-label="Hauptnavigation"
                className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3"
            >
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
                    Arbeitsbereich
                </p>
                <NavLink
                    onClick={() => setMobile(false)}
                    to="/"
                    end
                    className={({ isActive }) =>
                        cn("nav-item", isActive && "nav-item-active")
                    }
                >
                    <Building2 size={17} />
                    Übersicht
                </NavLink>
                {Array.from(
                    new Set(
                        resources
                            .filter(
                                (r) =>
                                    r.navigation !== false &&
                                    can(r.name, "list"),
                            )
                            .map((r) => r.navigationGroup ?? "Verwaltung"),
                    ),
                ).map((group) => (
                    <details key={group} open className="group py-2">
                        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {group}
                            <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                        </summary>
                        <div className="ml-3 space-y-1 border-l pl-2">
                            {resources
                                .filter(
                                    (r) =>
                                        r.navigation !== false &&
                                        can(r.name, "list") &&
                                        (r.navigationGroup ?? "Verwaltung") ===
                                            group,
                                )
                                .map((r) => (
                                    <NavLink
                                        onClick={() => setMobile(false)}
                                        key={r.name}
                                        to={`/${r.name}`}
                                        className={({ isActive }) =>
                                            cn(
                                                "nav-item",
                                                isActive && "nav-item-active",
                                            )
                                        }
                                    >
                                        <r.icon size={17} />
                                        {r.label}
                                    </NavLink>
                                ))}
                        </div>
                    </details>
                ))}
                <NavLink
                    onClick={() => setMobile(false)}
                    to="/components"
                    className={({ isActive }) =>
                        cn("nav-item", isActive && "nav-item-active")
                    }
                >
                    <ShieldCheck size={17} />
                    Komponenten
                </NavLink>
            </nav>
            <div className="m-4 rounded-xl bg-primary/5 p-4">
                <p className="text-sm font-medium text-primary">
                    Raum für das Wesentliche.
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Objekte, Menschen und Verträge an einem Ort.
                </p>
            </div>
            <div className="flex items-center gap-3 border-t px-5 py-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {user.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                        {user.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                        {user.email}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Abmelden"
                    onClick={onLogout}
                >
                    <LogOut size={15} />
                </Button>
            </div>
        </>
    );
    return (
        <div className="min-h-screen bg-background">
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card lg:flex",
                    compact && "lg:hidden",
                )}
            >
                {nav}
            </aside>
            <Sheet open={mobile} onOpenChange={setMobile}>
                <SheetContent side="left" className="w-72 p-0">
                    <SheetTitle className="sr-only">Navigation</SheetTitle>
                    {nav}
                </SheetContent>
            </Sheet>
            <div className={cn(!compact && "lg:pl-60")}>
                <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-5 backdrop-blur-sm lg:px-9">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="lg:hidden"
                            aria-label="Menü öffnen"
                            onClick={() => setMobile(true)}
                        >
                            <Menu />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="hidden lg:flex"
                            aria-label="Navigation umschalten"
                            onClick={() => setCompact(!compact)}
                        >
                            <PanelLeftClose />
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            Arbeitsbereich
                        </span>
                        <ChevronRight size={12} />
                        <span className="text-xs font-medium">
                            {resources.find((r) =>
                                location.pathname.startsWith("/" + r.name),
                            )?.label ??
                                (location.pathname === "/components"
                                    ? "Komponenten"
                                    : "Übersicht")}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-primary" />
                        nextHV Workspace
                    </div>
                </header>
                <main
                    className={cn(
                        "mx-auto max-w-[1800px] p-5 lg:p-7",
                        resources.some(
                            (r) => location.pathname === `/${r.name}`,
                        )
                            ? "h-[calc(100dvh-4rem)] min-h-0 overflow-hidden"
                            : "space-y-6 pb-16",
                    )}
                >
                    {children}
                </main>
            </div>
        </div>
    );
}
export function PageHeader({
    eyebrow,
    title,
    description,
    actions,
}: {
    eyebrow?: string;
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
                {eyebrow && (
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-primary">
                        {eyebrow}
                    </p>
                )}
                <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
                    {title}
                </h1>
                {description && (
                    <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}
export function Stack({ children }: { children: ReactNode }) {
    return <div className="space-y-5">{children}</div>;
}
export function Split({ main, aside }: { main: ReactNode; aside: ReactNode }) {
    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">{main}</div>
            <div className="min-w-0 space-y-6">{aside}</div>
        </div>
    );
}
export function Inline({ children }: { children: ReactNode }) {
    return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
export function FieldGrid({ children }: { children: ReactNode }) {
    return <div className="grid gap-5 sm:grid-cols-2">{children}</div>;
}
export function Muted({ children }: { children: ReactNode }) {
    return (
        <p className="text-sm leading-6 text-muted-foreground">{children}</p>
    );
}

export function CollectionPage({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-full min-h-0 flex-col gap-5 [&>div:not(:last-child)]:shrink-0">
            {children}
        </div>
    );
}
