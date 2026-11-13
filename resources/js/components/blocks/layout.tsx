import { Brand } from "./brand";
export { Brand } from "./brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { PersonAvatar } from "./people-avatar";
import { can } from "@/framework/permissions";
import type { ResourceDefinition } from "@/framework/types";
import { cn } from "@/lib/utils";
import {
    ChevronRight,
    ChevronsUpDown,
    House,
    LogOut,
    Menu,
    PanelLeftClose,
    Search,
    Shapes,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
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
    const [search, setSearch] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const visible = resources.filter(
        (r) => r.navigation !== false && can(r.name, "list"),
    );
    const current = resources.find((r) =>
        location.pathname.startsWith("/" + r.name),
    );
    useEffect(() => {
        const shortcut = (event: KeyboardEvent) => {
            if (
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === "k"
            ) {
                event.preventDefault();
                setSearch((open) => !open);
            }
        };
        window.addEventListener("keydown", shortcut);
        return () => window.removeEventListener("keydown", shortcut);
    }, []);
    const go = (path: string) => {
        setSearch(false);
        setMobile(false);
        navigate(path);
    };
    const nav = (
        <>
            <div className="p-3">
                <div className="flex items-center justify-between rounded-xl border bg-card p-3">
                    <div>
                        <Brand />
                        <p className="ml-10 mt-0.5 text-[10px] text-muted-foreground">
                            Meine Hausverwaltung
                        </p>
                    </div>
                    <ChevronsUpDown className="size-3 text-muted-foreground" />
                </div>
                <Button
                    variant="outline"
                    className="mt-3 h-8 w-full justify-start bg-card text-xs text-muted-foreground"
                    onClick={() => setSearch(true)}
                >
                    <Search /> Bereiche suchen{" "}
                    <kbd className="ml-auto rounded border bg-muted px-1 font-mono text-[10px]">
                        ⌘ K
                    </kbd>
                </Button>
            </div>
            <nav
                aria-label="Hauptnavigation"
                className="min-h-0 flex-1 overflow-y-auto px-3"
            >
                <p className="px-2.5 pb-2 pt-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
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
                    <House size={15} /> Übersicht
                </NavLink>
                {Array.from(
                    new Set(
                        visible.map((r) => r.navigationGroup ?? "Verwaltung"),
                    ),
                ).map((group) => (
                    <details key={group} open className="group pt-5">
                        <summary className="flex cursor-pointer list-none items-center justify-between px-2.5 pb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                            {group}
                            <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                        </summary>
                        <div className="space-y-0.5">
                            {visible
                                .filter(
                                    (r) =>
                                        (r.navigationGroup ?? "Verwaltung") ===
                                        group,
                                )
                                .map((r) => (
                                    <NavLink
                                        key={r.name}
                                        onClick={() => setMobile(false)}
                                        to={`/${r.name}`}
                                        className={({ isActive }) =>
                                            cn(
                                                "nav-item",
                                                isActive && "nav-item-active",
                                            )
                                        }
                                    >
                                        <r.icon size={15} />
                                        {r.label}
                                    </NavLink>
                                ))}
                        </div>
                    </details>
                ))}
            </nav>
            <div className="space-y-3 p-3">
                <NavLink
                    to="/components"
                    onClick={() => setMobile(false)}
                    className={({ isActive }) =>
                        cn("nav-item", isActive && "nav-item-active")
                    }
                >
                    <Shapes size={15} /> Komponenten
                </NavLink>
                <div className="flex items-center gap-2.5 rounded-xl border bg-card p-2.5">
                    <PersonAvatar person={{ id: "me", name: user.name }} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                            {user.name}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                            {user.email}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Abmelden"
                        onClick={onLogout}
                    >
                        <LogOut />
                    </Button>
                </div>
            </div>
        </>
    );
    return (
        <div className="min-h-screen bg-background">
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r bg-muted/70 lg:flex",
                    compact && "lg:hidden",
                )}
            >
                {nav}
            </aside>
            <Sheet open={mobile} onOpenChange={setMobile}>
                <SheetContent side="left" className="w-64 gap-0 bg-muted p-0">
                    <SheetTitle className="sr-only">Navigation</SheetTitle>
                    {nav}
                </SheetContent>
            </Sheet>
            <div className={cn(!compact && "lg:pl-56")}>
                <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur-sm lg:px-6">
                    <div className="flex min-w-0 items-center gap-3">
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
                        <Link
                            to="/"
                            className="hidden text-xs text-muted-foreground sm:inline"
                        >
                            Arbeitsbereich
                        </Link>
                        <ChevronRight className="hidden size-3 text-muted-foreground sm:block" />
                        <span className="truncate text-xs font-medium">
                            {current?.label ??
                                (location.pathname === "/components"
                                    ? "Komponenten"
                                    : "Übersicht")}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <time
                            className="hidden rounded-md border bg-card px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground md:block"
                            dateTime={new Date().toISOString().slice(0, 10)}
                        >
                            {new Intl.DateTimeFormat("de-DE", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                            }).format(new Date())}
                        </time>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="Bereiche suchen"
                            onClick={() => setSearch(true)}
                        >
                            <Search />
                        </Button>
                    </div>
                </header>
                <main
                    className={cn(
                        "mx-auto max-w-[1600px] p-4 lg:p-6",
                        resources.some(
                            (r) => location.pathname === `/${r.name}`,
                        )
                            ? "h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden"
                            : "pb-12",
                    )}
                >
                    {children}
                </main>
            </div>
            <CommandDialog
                open={search}
                onOpenChange={setSearch}
                title="Bereich öffnen"
                description="Suche in den verfügbaren Bereichen deiner Hausverwaltung."
            >
                <Command>
                    <CommandInput placeholder="Objekte, Verträge, Geschäftspartner …" />
                    <CommandList>
                        <CommandEmpty>Kein Bereich gefunden.</CommandEmpty>
                        <CommandGroup heading="Arbeitsbereich">
                            <CommandItem onSelect={() => go("/")}>
                                <House /> Übersicht
                            </CommandItem>
                        </CommandGroup>
                        {Array.from(
                            new Set(
                                visible.map(
                                    (r) => r.navigationGroup ?? "Verwaltung",
                                ),
                            ),
                        ).map((group) => (
                            <CommandGroup key={group} heading={group}>
                                {visible
                                    .filter(
                                        (r) =>
                                            (r.navigationGroup ??
                                                "Verwaltung") === group,
                                    )
                                    .map((r) => (
                                        <CommandItem
                                            key={r.name}
                                            onSelect={() => go(`/${r.name}`)}
                                        >
                                            <r.icon />
                                            {r.label}
                                        </CommandItem>
                                    ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </CommandDialog>
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
                <h1 className="text-2xl font-semibold tracking-tight">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
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
