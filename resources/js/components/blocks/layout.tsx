import { LanguagePicker } from "./language-picker";
import { usePermissionRevision } from "@/framework/permissions";
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
import {
    SidebarNavigation,
    useSidebarExpansion,
} from "@/framework/navigation/sidebar";
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
} from "lucide-react";
import {
    Fragment,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";

/** A single navigation tree feeds desktop, mobile, the icon rail and the command palette. */
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
            return (
                window.localStorage.getItem("nexthv.sidebar.compact") === "1"
            );
        } catch {
            return false;
        }
    });
    const [search, setSearch] = useState(false);
    const location = useLocation();
    const scrollArea = useRef<HTMLElement>(null);
    const navigate = useNavigate();
    const permissionRevision = usePermissionRevision();
    const navigationItems = useMemo(
        () =>
            resolveNavigation(
                navigation ?? defaultNavigation(resources, navigationGroups),
                resources,
                user,
            ),
        [
            resources,
            navigation,
            navigationGroups,
            user.id,
            user.name,
            user.email,
            permissionRevision,
        ],
    );
    const controls = useSidebarExpansion(navigationItems, user.id);
    const trail = navigationPath(
        navigationItems,
        location.pathname,
        location.search,
    ).filter((item) => item.id !== "home");
    const current = resources.find(
        (resource) =>
            location.pathname === `/${resource.name}` ||
            location.pathname.startsWith(`/${resource.name}/`),
    );
    const collection = resources.some(
        (resource) => location.pathname === `/${resource.name}`,
    );
    const detailId =
        current && location.pathname.startsWith(`/${current.name}/`)
            ? location.pathname.slice(current.name.length + 2).split("/")[0]
            : undefined;
    const currentTitle =
        trail.at(-1)?.label ??
        (location.pathname === "/components" ? "Komponenten" : "Übersicht");

    useEffect(() => {
        try {
            window.localStorage.setItem(
                "nexthv.sidebar.compact",
                compact ? "1" : "0",
            );
        } catch {
            // Storage is optional; the toggle always works in memory.
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
        setMobile(false);
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
            <div
                data-slot="sidebar-account"
                className={cn(
                    "shrink-0 border-t border-sidebar-border px-3 py-3",
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
                            "mb-2 flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            rail && "justify-center px-0",
                            isActive && "bg-muted text-foreground",
                        )
                    }
                >
                    <Shapes className="size-4" aria-hidden />
                    {!rail && "Komponenten"}
                </NavLink>
                {!rail && (
                    <div className="mb-2">
                        <LanguagePicker />
                    </div>
                )}
                <div
                    className={cn(
                        "flex min-w-0 items-center gap-2 rounded-lg bg-muted/40 px-2 py-2",
                        rail && "flex-col gap-1 bg-transparent px-0",
                    )}
                >
                    <PersonAvatar person={{ id: "me", name: user.name }} />
                    {!rail && (
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                                {user.name}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground">
                                {user.email}
                            </p>
                        </div>
                    )}
                    <Button
                        type="button"
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
                data-slot="desktop-sidebar"
                data-collapsed={compact || undefined}
                className={cn(
                    "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 motion-reduce:transition-none lg:flex",
                    compact ? "w-[68px]" : "w-[256px]",
                )}
            >
                <div
                    data-slot="sidebar-header"
                    className={cn(
                        "flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4",
                        compact && "justify-center px-2",
                    )}
                >
                    {compact ? (
                        <Link
                            to="/"
                            aria-label="nextHV Startseite"
                            className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Building2 className="size-4" />
                        </Link>
                    ) : (
                        <>
                            <Brand />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Navigation einklappen"
                                title="Navigation einklappen"
                                onClick={() => setCompact(true)}
                            >
                                <PanelLeftClose className="size-4" />
                            </Button>
                        </>
                    )}
                </div>
                {compact && (
                    <div className="flex shrink-0 justify-center border-b border-sidebar-border py-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Navigation ausklappen"
                            title="Navigation ausklappen"
                            onClick={() => setCompact(false)}
                        >
                            <PanelLeftOpen className="size-4" />
                        </Button>
                    </div>
                )}
                {sidebar(compact)}
            </aside>

            <Sheet open={mobile} onOpenChange={setMobile}>
                <SheetContent
                    side="left"
                    className="w-[min(19rem,90vw)] gap-0 bg-sidebar p-0"
                >
                    <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-5">
                        <Brand />
                    </div>
                    <SheetTitle className="sr-only">Navigation</SheetTitle>
                    <SheetDescription className="sr-only">
                        Bereiche deiner Hausverwaltung öffnen.
                    </SheetDescription>
                    {sidebar(false)}
                </SheetContent>
            </Sheet>

            <div className="flex min-w-0 flex-1 flex-col">
                <header
                    data-slot="shell-header"
                    className="z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card px-4 sm:px-5"
                >
                    <div className="flex min-w-0 items-center gap-2.5">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 lg:hidden"
                            aria-label="Menü öffnen"
                            onClick={() => setMobile(true)}
                        >
                            <Menu />
                        </Button>
                        <nav
                            aria-label="Seitenpfad"
                            className="flex min-w-0 items-center gap-2 text-sm"
                        >
                            <Link
                                to="/"
                                aria-label="Zur Übersicht"
                                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <House className="size-4" />
                            </Link>
                            {trail.length === 0 ? (
                                location.pathname === "/" ? (
                                    <span
                                        aria-current="page"
                                        className="truncate font-medium"
                                    >
                                        Übersicht
                                    </span>
                                ) : (
                                    <>
                                        <ChevronRight
                                            className="size-3.5 shrink-0 text-muted-foreground"
                                            aria-hidden
                                        />
                                        <span
                                            aria-current="page"
                                            className="truncate font-medium"
                                        >
                                            {currentTitle}
                                        </span>
                                    </>
                                )
                            ) : (
                                trail.map((item, index) => {
                                    const last =
                                        index === trail.length - 1 && !detailId;
                                    return (
                                        <Fragment key={item.id}>
                                            <ChevronRight
                                                className={cn(
                                                    "size-3.5 shrink-0 text-muted-foreground",
                                                    !last &&
                                                        index <
                                                            trail.length - 1 &&
                                                        "hidden md:block",
                                                )}
                                                aria-hidden
                                            />
                                            {last ? (
                                                <span
                                                    aria-current="page"
                                                    className="truncate font-medium"
                                                >
                                                    {item.label}
                                                </span>
                                            ) : item.to ? (
                                                <Link
                                                    to={item.to}
                                                    className={cn(
                                                        "max-w-40 truncate text-muted-foreground hover:text-foreground",
                                                        index <
                                                            trail.length - 1 &&
                                                            "hidden md:inline",
                                                    )}
                                                >
                                                    {item.label}
                                                </Link>
                                            ) : (
                                                <span className="hidden max-w-40 truncate text-muted-foreground md:inline">
                                                    {item.label}
                                                </span>
                                            )}
                                        </Fragment>
                                    );
                                })
                            )}
                            {detailId && (
                                <>
                                    <ChevronRight
                                        className="size-3.5 shrink-0 text-muted-foreground"
                                        aria-hidden
                                    />
                                    <span
                                        aria-current="page"
                                        className="truncate font-medium"
                                    >
                                        #{detailId}
                                    </span>
                                </>
                            )}
                        </nav>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 gap-2 px-2.5 text-muted-foreground"
                        aria-label="Bereiche suchen"
                        onClick={() => setSearch(true)}
                    >
                        <Search className="size-4" />
                        <span className="hidden sm:inline">
                            Bereiche suchen
                        </span>
                        <kbd className="hidden rounded border bg-muted/60 px-1.5 py-0.5 text-[10px] leading-none lg:inline">
                            Ctrl K
                        </kbd>
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
                                heading={
                                    section.to
                                        ? "Arbeitsbereich"
                                        : section.label
                                }
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
                                            {item.resource &&
                                            item.label !== item.resource.label
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
