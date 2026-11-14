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
    type NavigationItemDefinition,
    type NavigationGroupSettings,
} from "@/framework/navigation/sidebar-model";
import { SidebarNavigation, useSidebarExpansion } from "@/framework/navigation/sidebar";
import { cn } from "@/lib/utils";
import {
    Building2,
    ChevronRight,
    House,
    LogOut,
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
    Search,
    Shapes,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";

/** Sidebar-first shell: navigation, location and search keep independent chrome. */
export function AppShell({
    resources,
    navigation,
    navigationGroups,
    user,
    onLogout,
    children,
}: {
    resources: ResourceDefinition[];
    navigation?: NavigationItemDefinition[];
    navigationGroups?: Record<string, NavigationGroupSettings>;
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
    const navigate = useNavigate();
    const scrollArea = useRef<HTMLElement>(null);
    const navigationItems = useMemo(
        () =>
            resolveNavigation(
                navigation ?? defaultNavigation(resources, navigationGroups),
                resources,
                user,
            ),
        [resources, navigation, navigationGroups, user.id, user.name, user.email],
    );
    const controls = useSidebarExpansion(navigationItems, user.id);
    const trail = navigationPath(navigationItems, location.pathname, location.search);
    const current = resources.find(
        (resource) =>
            location.pathname === "/" + resource.name ||
            location.pathname.startsWith("/" + resource.name + "/"),
    );
    const collection = resources.some(
        (resource) => location.pathname === "/" + resource.name,
    );
    const detailId =
        current && location.pathname.startsWith("/" + current.name + "/")
            ? location.pathname.slice(current.name.length + 2).split("/")[0]
            : null;
    const leaf = trail.at(-1);
    const currentTitle = detailId && current
        ? current.singular + " #" + detailId
        : location.pathname === "/components"
          ? "Komponenten"
          : leaf?.label ?? current?.label ?? "Übersicht";
    const breadcrumbs = detailId ? trail : trail.slice(0, -1);

    useEffect(() => {
        try {
            window.localStorage.setItem(
                "nexthv.sidebar.compact",
                compact ? "1" : "0",
            );
        } catch {
            // Optional preference; navigation must work without storage.
        }
    }, [compact]);
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
    useEffect(() => {
        scrollArea.current?.scrollTo({ top: 0, left: 0 });
    }, [location.pathname]);

    const go = (path: string) => {
        setSearch(false);
        setMobile(false);
        navigate(path);
    };
    const sidebar = (rail: boolean, mobileView = false) => (
        <>
            <div
                data-slot="shell-sidebar-brand"
                className={cn(
                    "flex h-14 shrink-0 items-center gap-2 border-b px-3",
                    rail && "justify-center px-2",
                )}
            >
                {rail ? (
                    <Link
                        to="/"
                        aria-label="nextHV Startseite"
                        className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary focus-visible:outline-2 focus-visible:outline-ring"
                    >
                        <Building2 className="size-5" />
                    </Link>
                ) : (
                    <div className="min-w-0 flex-1 px-1"><Brand /></div>
                )}
                {!rail && (
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={mobileView ? "Menü schließen" : "Navigation umschalten"}
                        aria-expanded={!compact}
                        title={mobileView ? "Menü schließen" : "Navigation einklappen"}
                        onClick={() => mobileView ? setMobile(false) : setCompact(true)}
                    >
                        {mobileView ? <X /> : <PanelLeftClose />}
                    </Button>
                )}
            </div>
            <SidebarNavigation
                items={navigationItems}
                rail={rail}
                controls={controls}
                onNavigate={() => setMobile(false)}
                onExpandRail={() => setCompact(false)}
            />
            <div
                data-slot="shell-sidebar-footer"
                className={cn(
                    "shrink-0 border-t p-3",
                    rail && "px-2",
                )}
            >
                <NavLink
                    to="/components"
                    onClick={() => setMobile(false)}
                    title={rail ? "Komponenten" : undefined}
                    aria-label={rail ? "Komponenten" : undefined}
                    className={({ isActive }) =>
                        cn(
                            "nav-item mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            rail && "justify-center px-0",
                            isActive && "nav-item-active",
                        )
                    }
                >
                    <Shapes size={16} />
                    {!rail && "Komponenten"}
                </NavLink>
                <div
                    className={cn(
                        "flex min-w-0 items-center gap-2.5 rounded-xl bg-muted/40 p-2",
                        rail && "flex-col gap-2 bg-transparent p-1",
                    )}
                >
                    <PersonAvatar person={{ id: "me", name: user.name }} />
                    {!rail && (
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">{user.name}</p>
                            <p className="truncate text-[10px] text-muted-foreground">
                                {user.email}
                            </p>
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
                {rail && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Navigation umschalten"
                        aria-expanded={!compact}
                        title="Navigation ausklappen"
                        className="mt-2 flex w-full"
                        onClick={() => setCompact(false)}
                    >
                        <PanelLeftOpen />
                    </Button>
                )}
            </div>
        </>
    );
    const commandEntries = (section: NavigationItem) =>
        [
            ...(section.to ? [section] : []),
            ...flattenNavigation(section.children),
        ].filter((item) => item.to && !item.disabledReason);

    return (
        <div
            data-slot="app-shell"
            className="flex h-dvh min-w-0 overflow-hidden bg-background"
        >
            <aside
                data-slot="shell-sidebar"
                data-collapsed={compact || undefined}
                className={cn(
                    "hidden shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 motion-reduce:transition-none lg:flex",
                    compact ? "w-[68px]" : "w-64",
                )}
            >
                {sidebar(compact)}
            </aside>
            <Sheet open={mobile} onOpenChange={setMobile}>
                <SheetContent
                    side="left"
                    showCloseButton={false}
                    className="w-72 gap-0 bg-sidebar p-0"
                >
                    <SheetTitle className="sr-only">Navigation</SheetTitle>
                    <SheetDescription className="sr-only">
                        Bereiche deiner Hausverwaltung öffnen.
                    </SheetDescription>
                    {sidebar(false, true)}
                </SheetContent>
            </Sheet>
            <div data-slot="shell-main" className="flex min-h-0 min-w-0 flex-1 flex-col">
                <header
                    data-slot="shell-header"
                    className="z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-5"
                >
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="lg:hidden"
                        aria-label="Menü öffnen"
                        onClick={() => setMobile(true)}
                    >
                        <Menu />
                    </Button>
                    <nav
                        aria-label="Seitenpfad"
                        data-slot="shell-breadcrumb"
                        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-sm"
                    >
                        {location.pathname === "/" ? (
                            <span className="truncate font-semibold text-foreground" aria-current="page">
                                Übersicht
                            </span>
                        ) : (
                            <>
                                <Link
                                    to="/"
                                    aria-label="Zur Übersicht"
                                    title="Übersicht"
                                    className="hidden size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex"
                                >
                                    <House className="size-4" />
                                </Link>
                                {breadcrumbs.map((item) => (
                                    <span
                                        key={item.id}
                                        className="hidden min-w-0 items-center gap-2 sm:inline-flex"
                                    >
                                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
                                        {item.to && !item.disabledReason ? (
                                            <Link
                                                to={item.to}
                                                className="max-w-40 truncate text-muted-foreground hover:text-foreground"
                                            >
                                                {item.label}
                                            </Link>
                                        ) : (
                                            <span className="max-w-40 truncate text-muted-foreground">
                                                {item.label}
                                            </span>
                                        )}
                                    </span>
                                ))}
                                <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/70 sm:block" />
                                <span className="min-w-0 truncate font-semibold text-foreground" aria-current="page">
                                    {currentTitle}
                                </span>
                            </>
                        )}
                    </nav>
                    <Button
                        type="button"
                        variant="outline"
                        className="hidden h-9 shrink-0 gap-2 text-muted-foreground sm:inline-flex"
                        aria-label="Bereich suchen"
                        onClick={() => setSearch(true)}
                    >
                        <Search className="size-4" />
                        <span>Bereich suchen</span>
                        <kbd className="ml-3 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                            Strg K
                        </kbd>
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="sm:hidden"
                        aria-label="Suche öffnen"
                        onClick={() => setSearch(true)}
                    >
                        <Search />
                    </Button>
                </header>
                <main
                    ref={scrollArea}
                    data-slot="workspace-scroll"
                    className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain md:[scrollbar-gutter:stable]"
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
                                            value={
                                                (item.resource?.label ?? "") + " " +
                                                item.label + " " + (item.description ?? "")
                                            }
                                            onSelect={() => go(item.to!)}
                                        >
                                            {Icon && <Icon />}
                                            {item.resource && item.label !== item.resource.label
                                                ? item.resource.label + " · " + item.label
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
                "mx-auto w-full min-w-0 px-3 py-4 sm:p-5 lg:p-6",
                width === "workspace" ? "max-w-[1440px]" : "max-w-5xl",
                mode === "collection"
                    ? "flex min-h-full flex-col md:h-full md:min-h-0 md:overflow-hidden"
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
        <div className="flex w-full min-w-0 flex-col gap-4 md:h-full md:min-h-0 md:flex-1 [&>div:not(:last-child)]:shrink-0">
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
