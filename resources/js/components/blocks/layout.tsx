import { GlobalSearch } from "./global-search";
import { useI18n } from "@/framework/i18n";
import { usePermissionRevision } from "@/framework/permissions";
import { Brand } from "./brand";
export { Brand } from "./brand";
import { Button } from "@/components/ui/button";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar";
import { PersonAvatar } from "./people-avatar";
import type { ResourceDefinition } from "@/framework/types";
import {
    defaultNavigation,
    flattenNavigation,
    navigationPath,
    resolveNavigation,
    type NavigationItemDefinition,
    type NavigationGroupSettings,
} from "@/framework/navigation/sidebar-model";
import {
    SidebarNavigation,
    useSidebarExpansion,
} from "@/framework/navigation/sidebar";
import { cn } from "@/lib/utils";
import { LogOut, Search } from "lucide-react";
import {
    Fragment,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router";

type AppShellProps = {
    resources: ResourceDefinition[];
    navigation?: NavigationItemDefinition[];
    navigationGroups?: Record<string, NavigationGroupSettings>;
    user: { id?: number; name: string; email: string };
    onLogout: () => void;
    children: ReactNode;
};

const sidebarColors =
    "[--sidebar:var(--color-background)] [--sidebar-accent:color-mix(in_oklab,var(--color-primary)_5%,transparent)] [--sidebar-accent-foreground:var(--color-primary)]";

/** A single navigation tree feeds desktop, mobile, the icon rail and the command palette. */
export function AppShell(props: AppShellProps) {
    const [compact, setCompact] = useState(() => {
        try {
            return (
                window.localStorage.getItem("nexthv.sidebar.compact") === "1"
            );
        } catch {
            return false;
        }
    });

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

    return (
        <div
            data-slot="app-shell"
            className="flex h-dvh min-w-0 overflow-hidden bg-background"
        >
            <SidebarProvider
                open={!compact}
                onOpenChange={(open) => setCompact(!open)}
                className={cn(
                    "h-full min-h-0 flex-col overflow-hidden",
                    sidebarColors,
                )}
                style={
                    {
                        "--sidebar-width": "260px",
                        "--sidebar-width-icon": "62px",
                        "--header-height": "50px",
                    } as CSSProperties
                }
            >
                <AppShellContent {...props} />
            </SidebarProvider>
        </div>
    );
}

function AppShellContent({
    resources,
    navigation,
    navigationGroups,
    user,
    onLogout,
    children,
}: AppShellProps) {
    const { t } = useI18n();
    const { state, setOpen, isMobile, setOpenMobile } = useSidebar();
    const rail = state === "collapsed" && !isMobile;
    const [search, setSearch] = useState(false);
    const location = useLocation();
    const scrollArea = useRef<HTMLDivElement>(null);
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
    const collection = current && location.pathname === `/${current.name}`;
    const pageMode =
        (collection && current.collection?.renderer === "grid") ||
        location.pathname.startsWith("/enterprise-demo/")
            ? "grid"
            : collection
              ? "collection"
              : "page";
    const detailId =
        current && location.pathname.startsWith(`/${current.name}/`)
            ? location.pathname.slice(current.name.length + 2).split("/")[0]
            : undefined;
    const currentTitle =
        trail.at(-1)?.label ??
        (location.pathname === "/components" ? "Komponenten" : "Übersicht");
    const toggleLabel = isMobile
        ? "Menü öffnen"
        : rail
          ? "Navigation ausklappen"
          : "Navigation einklappen";
    const openSearch = () => {
        setOpenMobile(false);
        setSearch(true);
    };

    useEffect(() => {
        const shortcut = (event: KeyboardEvent) => {
            if (
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === "k"
            ) {
                event.preventDefault();
                setOpenMobile(false);
                setSearch((open) => !open);
            }
        };
        window.addEventListener("keydown", shortcut);
        return () => window.removeEventListener("keydown", shortcut);
    }, [setOpenMobile]);
    useEffect(() => {
        scrollArea.current?.scrollTo({ top: 0, left: 0 });
        setOpenMobile(false);
    }, [location.pathname, setOpenMobile]);

    return (
        <>
            <header
                data-slot="shell-header"
                className="z-50 flex h-(--header-height) w-full shrink-0 items-center gap-2 border-b bg-background px-4"
            >
                <SidebarTrigger
                    aria-label={toggleLabel}
                    title={toggleLabel}
                    className="shrink-0"
                />
                <div className="hidden shrink-0 md:block">
                    <Brand />
                </div>
                <Breadcrumb aria-label="Seitenpfad" className="min-w-0 flex-1">
                    <BreadcrumbList className="flex-nowrap gap-2">
                        <BreadcrumbItem className="shrink-0 md:hidden">
                            <BreadcrumbLink
                                render={
                                    <Link to="/" aria-label="Zur Übersicht" />
                                }
                            >
                                nextHV
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator className="shrink-0 text-xs">
                            /
                        </BreadcrumbSeparator>
                        {trail.length === 0 ? (
                            <BreadcrumbItem className="min-w-0">
                                <BreadcrumbPage className="truncate font-normal">
                                    {currentTitle}
                                </BreadcrumbPage>
                            </BreadcrumbItem>
                        ) : (
                            trail.map((item, index) => {
                                const last =
                                    index === trail.length - 1 && !detailId;
                                const hiddenOnMobile =
                                    !last && index < trail.length - 1;
                                return (
                                    <Fragment key={item.id}>
                                        {index > 0 && (
                                            <BreadcrumbSeparator className="hidden shrink-0 text-xs md:block">
                                                /
                                            </BreadcrumbSeparator>
                                        )}
                                        <BreadcrumbItem
                                            className={cn(
                                                "min-w-0",
                                                hiddenOnMobile &&
                                                    "hidden md:inline-flex",
                                            )}
                                        >
                                            {last ? (
                                                <BreadcrumbPage className="truncate font-normal">
                                                    {item.label}
                                                </BreadcrumbPage>
                                            ) : item.to ? (
                                                <BreadcrumbLink
                                                    render={
                                                        <Link to={item.to} />
                                                    }
                                                    className="max-w-40 truncate"
                                                >
                                                    {item.label}
                                                </BreadcrumbLink>
                                            ) : (
                                                <span className="max-w-40 truncate">
                                                    {item.label}
                                                </span>
                                            )}
                                        </BreadcrumbItem>
                                    </Fragment>
                                );
                            })
                        )}
                        {detailId && (
                            <>
                                <BreadcrumbSeparator className="shrink-0 text-xs">
                                    /
                                </BreadcrumbSeparator>
                                <BreadcrumbItem className="min-w-0">
                                    <BreadcrumbPage className="truncate font-normal">
                                        #{detailId}
                                    </BreadcrumbPage>
                                </BreadcrumbItem>
                            </>
                        )}
                    </BreadcrumbList>
                </Breadcrumb>
                {isMobile && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("searchRecords")}
                        onClick={openSearch}
                    >
                        <Search className="size-4" aria-hidden="true" />
                    </Button>
                )}
            </header>
            <div className="flex min-h-0 flex-1">
                <Sidebar
                    collapsible="icon"
                    mobileTitle="Navigation"
                    mobileDescription="Bereiche deiner Hausverwaltung öffnen."
                    className="top-(--header-height) h-[calc(100dvh-var(--header-height))]! motion-reduce:transition-none"
                >
                    <aside
                        data-slot={
                            isMobile ? "mobile-sidebar" : "desktop-sidebar"
                        }
                        data-collapsed={rail || undefined}
                        className={cn(
                            "flex h-full min-h-0 flex-col bg-sidebar",
                            sidebarColors,
                        )}
                    >
                        <SidebarHeader
                            className={cn(
                                "shrink-0 px-4 pt-4 pb-2",
                                rail && "items-center px-0",
                            )}
                        >
                            <Button
                                type="button"
                                variant={rail ? "ghost" : "outline"}
                                size="sm"
                                aria-label={t("searchRecords")}
                                title={rail ? t("searchRecords") : undefined}
                                onClick={openSearch}
                                className={cn(
                                    "relative h-8 w-full justify-start gap-2 rounded-lg px-2 font-normal text-muted-foreground",
                                    rail && "size-8 justify-center p-0",
                                )}
                            >
                                <Search
                                    className="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                {!rail && (
                                    <>
                                        <span className="truncate pr-12">
                                            Suchen …
                                        </span>
                                        <kbd className="absolute top-1/2 right-2 inline-flex h-5 -translate-y-1/2 items-center rounded-sm bg-muted px-1 font-sans text-xs">
                                            Ctrl K
                                        </kbd>
                                    </>
                                )}
                            </Button>
                        </SidebarHeader>
                        <SidebarContent className="overflow-hidden">
                            <SidebarNavigation
                                items={navigationItems}
                                rail={rail}
                                controls={controls}
                                onNavigate={() => setOpenMobile(false)}
                                onExpandRail={() => setOpen(true)}
                            />
                        </SidebarContent>
                        <SidebarFooter
                            className={cn("mt-2 shrink-0 px-4", rail && "px-0")}
                        >
                            <footer data-slot="sidebar-account">
                                <div
                                    data-slot="sidebar-user"
                                    className={cn(
                                        "flex min-h-12 min-w-0 items-center gap-2 rounded-md p-2",
                                        rail && "flex-col px-0",
                                    )}
                                >
                                    <PersonAvatar
                                        person={{
                                            id: user.id ?? "me",
                                            name: user.name,
                                        }}
                                        className="size-7 rounded-md after:rounded-md"
                                        fallbackClassName="rounded-md bg-primary text-xs font-semibold text-primary-foreground"
                                    />
                                    {!rail && (
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">
                                                {user.name}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
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
                                        className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                                    >
                                        <LogOut
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                    </Button>
                                </div>
                            </footer>
                        </SidebarFooter>
                    </aside>
                </Sidebar>
                <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
                    <div
                        ref={scrollArea}
                        data-slot="workspace-scroll"
                        className={cn(
                            "min-h-0 min-w-0 flex-1",
                            pageMode === "grid"
                                ? "overflow-hidden"
                                : "overflow-y-auto overscroll-contain md:[scrollbar-gutter:stable]",
                        )}
                    >
                        <PageWrapper mode={pageMode}>{children}</PageWrapper>
                    </div>
                </SidebarInset>
            </div>
            <GlobalSearch open={search} onOpenChange={setSearch} />
        </>
    );
}

export function PageWrapper({
    children,
    mode = "page",
    width = "workspace",
}: {
    children: ReactNode;
    mode?: "page" | "collection" | "grid";
    width?: "workspace" | "reading";
}) {
    return (
        <div
            data-slot="page-wrapper"
            data-mode={mode}
            className={cn(
                "mx-auto w-full min-w-0 p-4 md:p-6",
                width === "workspace" ? "max-w-7xl" : "max-w-5xl",
                mode === "grid"
                    ? "flex h-full min-h-0 flex-col overflow-hidden"
                    : mode === "collection"
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
