import { Brand } from "./brand";
export { Brand } from "./brand";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
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
import type { ResourceDefinition } from "@/framework/types";
import {
    defaultNavigation,
    flattenNavigation,
    navigationPath,
    resolveNavigation,
    type NavigationItem,
} from "@/framework/navigation/sidebar-model";
import {
    SidebarNavigation,
    useSidebarExpansion,
} from "@/framework/navigation/sidebar";
import { cn } from "@/lib/utils";
import {
    ChevronRight,
    LogOut,
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
    Shapes,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";

/** Header-first REUI workspace shell. All navigation surfaces share one resolved tree. */
export function AppShell({
    resources,
    user,
    onLogout,
    children,
}: {
    resources: ResourceDefinition[];
    user: { id?: number; name: string; email: string };
    onLogout: () => void;
    children: ReactNode;
}) {
    const [mobile, setMobile] = useState(false);
    const [compact, setCompact] = useState(() => {
        try {
            return window.localStorage.getItem("nexthv.sidebar.compact") === "1";
        } catch {
            return false;
        }
    });
    const [search, setSearch] = useState(false);
    const location = useLocation();
    const scrollArea = useRef<HTMLElement>(null);
    const navigate = useNavigate();
    const navigationItems = useMemo(
        () => resolveNavigation(defaultNavigation(resources), resources, user),
        [resources, user.id, user.name, user.email],
    );
    const controls = useSidebarExpansion(navigationItems, user.id);
    const trail = navigationPath(navigationItems, location.pathname, location.search);
    const leaf = trail.at(-1);
    const current = resources.find(
        (resource) =>
            location.pathname === `/${resource.name}` ||
            location.pathname.startsWith(`/${resource.name}/`),
    );
    const collection = resources.some(
        (resource) => location.pathname === `/${resource.name}`,
    );
    const currentTitle = current
        ? leaf?.view ? `${current.label} · ${leaf.label}` : current.label
        : location.pathname === "/components" ? "Komponenten" : "Übersicht";

    useEffect(() => {
        try {
            window.localStorage.setItem("nexthv.sidebar.compact", compact ? "1" : "0");
        } catch {
            // Optional workspace preference.
        }
    }, [compact]);
    useEffect(() => {
        const shortcut = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setSearch((open) => !open);
            }
        };
        window.addEventListener("keydown", shortcut);
        return () => window.removeEventListener("keydown", shortcut);
    }, []);
    useEffect(() => {
        scrollArea.current?.scrollTo({ top: 0, left: 0 });
    }, [location.pathname]);
    const go = (path: string) => {
        setSearch(false);
        setMobile(false);
        navigate(path);
    };
    const sidebar = (rail: boolean) => (
        <>
            <SidebarNavigation
                items={navigationItems}
                rail={rail}
                controls={controls}
                onNavigate={() => setMobile(false)}
                onExpandRail={() => setCompact(false)}
            />
            <div className={cn("space-y-3 border-t p-3", rail && "px-2")}>
                <NavLink
                    to="/components"
                    onClick={() => setMobile(false)}
                    title={rail ? "Komponenten" : undefined}
                    aria-label={rail ? "Komponenten" : undefined}
                    className={({ isActive }) =>
                        cn(
                            "nav-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            rail && "justify-center px-0",
                            isActive && "nav-item-active",
                        )
                    }
                >
                    <Shapes size={16} /> {!rail && "Komponenten"}
                </NavLink>
                <div
                    className={cn(
                        "flex items-center gap-2.5 rounded-lg p-1",
                        rail && "flex-col gap-2",
                    )}
                >
                    <PersonAvatar person={{ id: "me", name: user.name }} />
                    {!rail && (
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{user.name}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
                        </div>
                    )}
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Abmelden"
                        title="Abmelden"
                        onClick={onLogout}
                    >
                        <LogOut />
                    </Button>
                </div>
            </div>
        </>
    );
    const commandEntries = (section: NavigationItem) => [
        ...(section.to ? [section] : []),
        ...flattenNavigation(section.children),
    ].filter((item) => item.to && !item.disabledReason);
    return (
        <div
            data-slot="app-shell"
            className="flex h-dvh min-w-0 flex-col overflow-hidden bg-background"
        >
            <header
                data-slot="shell-header"
                className="z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 lg:px-5"
            >
                <div className="flex shrink-0 items-center gap-3 lg:w-60">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="lg:hidden"
                        aria-label="Menü öffnen"
                        onClick={() => setMobile(true)}
                    >
                        <Menu />
                    </Button>
                    <Brand />
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto hidden lg:flex"
                        aria-label="Navigation umschalten"
                        aria-expanded={!compact}
                        onClick={() => setCompact((value) => !value)}
                    >
                        {compact ? <PanelLeftOpen /> : <PanelLeftClose />}
                    </Button>
                </div>
                <span className="hidden h-5 border-l sm:block" aria-hidden />
                <nav aria-label="Seitenpfad" className="flex min-w-0 items-center gap-2 text-xs">
                    <Link to="/" className="hidden text-muted-foreground hover:text-foreground md:inline">
                        Arbeitsbereich
                    </Link>
                    {trail.slice(0, -1).map((item) => (
                        <span key={item.id} className="hidden min-w-0 items-center gap-2 md:inline-flex">
                            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                            {item.to ? (
                                <Link to={item.to} className="truncate text-muted-foreground hover:text-foreground">
                                    {item.label}
                                </Link>
                            ) : (
                                <span className="truncate text-muted-foreground">{item.label}</span>
                            )}
                        </span>
                    ))}
                    <ChevronRight className="hidden size-3 text-muted-foreground md:block" />
                    <span className="truncate font-medium" aria-current="page">
                        {currentTitle}
                    </span>
                </nav>
            </header>
            <div className="flex min-h-0 min-w-0 flex-1">
                <aside
                    className={cn(
                        "hidden shrink-0 flex-col border-r bg-sidebar lg:flex",
                        compact ? "w-16" : "w-72",
                    )}
                >
                    {sidebar(compact)}
                </aside>
                <Sheet open={mobile} onOpenChange={setMobile}>
                    <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0">
                        <div className="px-5 py-5"><Brand /></div>
                        <SheetTitle className="sr-only">Navigation</SheetTitle>
                        <SheetDescription className="sr-only">
                            Bereiche deiner Hausverwaltung öffnen.
                        </SheetDescription>
                        {sidebar(false)}
                    </SheetContent>
                </Sheet>
                <main
                    ref={scrollArea}
                    data-slot="workspace-scroll"
                    className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
                >
                    <PageWrapper mode={collection ? "collection" : "page"}>
                        {children}
                    </PageWrapper>
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
                        {navigationItems.map((section) => (
                            <CommandGroup
                                key={section.id}
                                heading={section.to ? "Arbeitsbereich" : section.label}
                            >
                                {commandEntries(section).map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <CommandItem
                                            key={item.id}
                                            value={`${item.resource?.label ?? ""} ${item.label} ${item.description ?? ""}`}
                                            onSelect={() => go(item.to!)}
                                        >
                                            {Icon && <Icon />}
                                            {item.resource && item.label !== item.resource.label
                                                ? `${item.resource.label} · ${item.label}`
                                                : item.label}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </CommandDialog>
        </div>
    );
}

export function PageWrapper({
    children,
    mode = "page",
    width = "workspace",
}: {
    children: ReactNode;
    mode?: "page" | "collection";
    width?: "workspace" | "reading";
}) {
    return (
        <div
            data-slot="page-wrapper"
            data-mode={mode}
            className={cn(
                "mx-auto w-full min-w-0 p-4 lg:p-6",
                width === "workspace" ? "max-w-[1440px]" : "max-w-5xl",
                mode === "collection"
                    ? "flex h-full min-h-0 flex-col overflow-hidden"
                    : "min-h-full pb-10",
            )}
        >
            {children}
        </div>
    );
}
export function PageHeader({
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
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <div className="min-w-0 flex-1 basis-64">
                <h1 className="break-words text-2xl font-semibold tracking-tight">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            {actions && (
                <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
                    {actions}
                </div>
            )}
        </div>
    );
}
export function Stack({ children }: { children: ReactNode }) {
    return <div className="min-w-0 space-y-5">{children}</div>;
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
    return (
        <div className="@container/fields min-w-0">
            <div className="grid min-w-0 gap-x-5 gap-y-4 @min-[28rem]/fields:grid-cols-2">
                {children}
            </div>
        </div>
    );
}
export function Muted({ children }: { children: ReactNode }) {
    return (
        <p className="text-sm leading-6 text-muted-foreground">{children}</p>
    );
}

export function CollectionPage({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-full w-full min-h-0 flex-1 flex-col gap-5 [&>div:not(:last-child)]:shrink-0">
            {children}
        </div>
    );
}

export function DetailPageLayout({ children }: { children: ReactNode }) {
    return (
        <div data-slot="detail-layout" className="w-full min-w-0 space-y-5">
            {children}
        </div>
    );
}
export function DetailColumns({
    main,
    aside,
}: {
    main: ReactNode;
    aside: ReactNode;
}) {
    return (
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
            <Stack>{main}</Stack>
            <Stack>{aside}</Stack>
        </div>
    );
}
