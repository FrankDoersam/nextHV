import { Collapsible } from "@base-ui/react/collapsible";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FolderClosed } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { Link, useLocation } from "react-router";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { viewCountQuery } from "@/framework/tables/collection-views";
import {
    navigationBranchActive,
    navigationSelected,
    type NavigationItem,
} from "./sidebar-model";

type Expansion = Record<string, boolean>;

function storedExpansion(key: string): Expansion {
    try {
        const value = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        return value && typeof value === "object" && !Array.isArray(value)
            ? Object.fromEntries(
                  Object.entries(value as Record<string, unknown>).filter(
                      (entry): entry is [string, boolean] =>
                          typeof entry[1] === "boolean",
                  ),
              )
            : {};
    } catch {
        return {};
    }
}

/** One disclosure state is shared by desktop and mobile, scoped to the signed-in user. */
export function useSidebarExpansion(items: NavigationItem[], userId?: number) {
    const { pathname, search } = useLocation();
    const key = `nexthv.sidebar.expanded.v1.${userId ?? "current"}`;
    const [overrides, setOverrides] = useState<Expansion>(() =>
        storedExpansion(key),
    );

    useEffect(() => {
        try {
            window.localStorage.setItem(key, JSON.stringify(overrides));
        } catch {
            // Persistence is an enhancement; blocked storage must not block navigation.
        }
    }, [key, overrides]);

    useEffect(() => {
        const ancestors: string[] = [];
        const visit = (item: NavigationItem): boolean => {
            const childActive = item.children.some(visit);
            if (childActive && item.children.length > 0)
                ancestors.push(item.id);
            return childActive || navigationSelected(item, pathname, search);
        };
        items.forEach(visit);
        if (!ancestors.length) return;
        setOverrides((previous) => {
            if (ancestors.every((id) => previous[id])) return previous;
            return {
                ...previous,
                ...Object.fromEntries(ancestors.map((id) => [id, true])),
            };
        });
    }, [items, pathname, search]);

    return {
        isOpen: (item: NavigationItem) =>
            overrides[item.id] ??
            (navigationBranchActive(item, pathname, search) || item.defaultOpen === true),
        setOpen: (id: string, open: boolean) =>
            setOverrides((current) => ({ ...current, [id]: open })),
    };
}

type ExpansionControls = ReturnType<typeof useSidebarExpansion>;

function NavCount({ item }: { item: NavigationItem }) {
    const view = item.resource!.views!.find(
        (candidate) => candidate.id === item.view,
    )!;
    const query = useQuery({
        ...viewCountQuery(item.resource!, view, []),
        enabled: !item.disabledReason,
    });
    return query.isPending ? (
        <Skeleton
            data-slot="sidebar-count-loading"
            className="h-4 w-6 shrink-0 rounded-md"
        />
    ) : (
        <span
            data-slot="sidebar-count"
            className="min-w-6 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-center text-[10px] font-medium tabular-nums text-muted-foreground"
            title={query.isError ? "Anzahl nicht verfügbar" : undefined}
        >
            {query.isError ? "—" : query.data}
        </span>
    );
}
function NavBadge({ item }: { item: NavigationItem }) {
    if (item.disabledReason) return null;
    if (
        item.count &&
        item.resource?.views?.some(
            (candidate) => candidate.id === item.view && candidate.count,
        )
    ) {
        return <NavCount item={item} />;
    }
    return item.badge ? (
        <span className="shrink-0 rounded-md bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            {item.badge}
        </span>
    ) : null;
}

function NavHint({
    trigger,
    item,
    rail,
}: {
    trigger: ReactElement;
    item: NavigationItem;
    rail: boolean;
}) {
    const hint = [
        rail ? item.label : undefined,
        item.disabledReason,
        item.tooltip ?? item.description,
    ]
        .filter(Boolean)
        .join(" · ");
    return hint ? (
        <Tooltip>
            <TooltipTrigger render={trigger} />
            <TooltipContent side="right" align="center" className="max-w-64">
                {hint}
            </TooltipContent>
        </Tooltip>
    ) : (
        trigger
    );
}

function SidebarNode({
    item,
    level,
    controls,
    onNavigate,
    pathname,
    search,
}: {
    item: NavigationItem;
    level: number;
    controls: ExpansionControls;
    onNavigate: () => void;
    pathname: string;
    search: string;
}) {
    const hasChildren = item.children.length > 0;
    const open = controls.isOpen(item);
    const selected = navigationSelected(item, pathname, search);
    const branchActive = navigationBranchActive(item, pathname, search);
    const Icon = item.icon ?? (hasChildren && !item.to ? FolderClosed : undefined);

    // REUI Base-Nova selection: one quiet full-row tint. No leading rounded
    // border, half-circle, branch connector or separate selection dot.
    const rowClasses = cn(
        "group/nav flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-[background-color,color] duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
            ? "bg-primary/[0.09] font-semibold text-foreground"
            : branchActive
              ? "font-medium text-foreground hover:bg-muted/60"
              : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        item.disabledReason && "cursor-not-allowed opacity-50",
    );
    const label = (
        <>
            {Icon && (
                <Icon
                    aria-hidden="true"
                    className={cn(
                        "size-4 shrink-0 transition-colors",
                        selected
                            ? "text-primary"
                            : "text-muted-foreground/75 group-hover/nav:text-foreground",
                    )}
                />
            )}
            <span className="min-w-0 flex-1 truncate text-left">
                {item.label}
            </span>
        </>
    );
    const link =
        item.to && !item.disabledReason ? (
            <Link
                to={item.to}
                data-slot="sidebar-link"
                data-active={selected ? "true" : undefined}
                aria-current={selected ? "page" : undefined}
                className={rowClasses}
                onClick={onNavigate}
            >
                {label}
                <NavBadge item={item} />
            </Link>
        ) : item.to ? (
            <span
                data-slot="sidebar-link-disabled"
                role="link"
                aria-disabled="true"
                tabIndex={0}
                className={rowClasses}
            >
                {label}
            </span>
        ) : null;

    if (!hasChildren) {
        return link ? (
            <div data-slot="sidebar-item" data-level={level}>
                <NavHint trigger={link} item={item} rail={false} />
            </div>
        ) : null;
    }

    return (
        <Collapsible.Root
            data-slot="sidebar-section"
            data-level={level}
            open={open}
            onOpenChange={(next) => controls.setOpen(item.id, next)}
            className={cn("min-w-0", level === 0 && "mt-3")}
        >
            {link ? (
                <div className="flex min-w-0 items-center gap-1">
                    <div className="min-w-0 flex-1">
                        <NavHint trigger={link} item={item} rail={false} />
                    </div>
                    <Collapsible.Trigger
                        aria-label={`${item.label} Unterpunkte ${open ? "einklappen" : "ausklappen"}`}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <ChevronDown
                            aria-hidden="true"
                            className={cn(
                                "size-3.5 transition-transform duration-150 motion-reduce:transition-none",
                                open && "rotate-180",
                            )}
                        />
                    </Collapsible.Trigger>
                </div>
            ) : (
                <Collapsible.Trigger
                    data-slot="sidebar-group-trigger"
                    data-branch-active={branchActive ? "true" : undefined}
                    className={cn(
                        "group/nav flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-[background-color,color] duration-150 motion-reduce:transition-none hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        branchActive
                            ? "text-foreground"
                            : "text-muted-foreground",
                        item.disabledReason && "opacity-50",
                    )}
                    title={item.tooltip ?? item.description}
                >
                    {Icon && (
                        <Icon
                            aria-hidden="true"
                            className={cn(
                                "size-4 shrink-0",
                                branchActive
                                    ? "text-primary"
                                    : "text-muted-foreground/75 group-hover/nav:text-foreground",
                            )}
                        />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                        {item.label}
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className={cn(
                            "size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150 motion-reduce:transition-none",
                            open && "rotate-180",
                        )}
                    />
                </Collapsible.Trigger>
            )}
            <Collapsible.Panel className="min-w-0">
                <div className="space-y-0.5 pt-0.5 pl-3">
                    {item.children.map((child) => (
                        <SidebarNode
                            key={child.id}
                            item={child}
                            level={level + 1}
                            controls={controls}
                            onNavigate={onNavigate}
                            pathname={pathname}
                            search={search}
                        />
                    ))}
                </div>
            </Collapsible.Panel>
        </Collapsible.Root>
    );
}

/** One REUI/Base-Nova navigation tree for desktop, icon rail and mobile. */
export function SidebarNavigation({
    items,
    rail,
    controls,
    onNavigate,
    onExpandRail,
}: {
    items: NavigationItem[];
    rail: boolean;
    controls: ExpansionControls;
    onNavigate: () => void;
    onExpandRail: () => void;
}) {
    const { pathname, search } = useLocation();

    return (
        <TooltipProvider delay={250}>
            <nav
                aria-label="Hauptnavigation"
                data-slot="sidebar-navigation"
                className={cn(
                    "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-4",
                    rail && "px-2 py-4",
                )}
            >
                {rail ? (
                    <div className="space-y-1">
                        {items.map((item, index) => {
                            const Icon = item.icon ?? FolderClosed;
                            const selected = navigationBranchActive(
                                item,
                                pathname,
                                search,
                            );
                            const tileClasses = cn(
                                "flex size-10 items-center justify-center rounded-md transition-[background-color,color] duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selected
                                    ? "bg-primary/[0.09] text-primary"
                                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            );
                            const trigger = item.disabledReason ? (
                                <span
                                    role="link"
                                    aria-disabled="true"
                                    tabIndex={0}
                                    aria-label={item.label}
                                    className={cn(tileClasses, "opacity-50")}
                                >
                                    <Icon aria-hidden="true" className="size-4" />
                                </span>
                            ) : item.children.length ? (
                                <button
                                    type="button"
                                    data-slot="sidebar-rail-group"
                                    aria-label={`${item.label} Untermenü öffnen`}
                                    aria-pressed={selected}
                                    onClick={() => {
                                        controls.setOpen(item.id, true);
                                        onExpandRail();
                                    }}
                                    className={tileClasses}
                                >
                                    <Icon aria-hidden="true" className="size-4" />
                                </button>
                            ) : (
                                <Link
                                    to={item.to ?? "/"}
                                    data-slot="sidebar-rail-link"
                                    onClick={onNavigate}
                                    aria-label={item.label}
                                    aria-current={selected ? "page" : undefined}
                                    className={tileClasses}
                                >
                                    <Icon aria-hidden="true" className="size-4" />
                                </Link>
                            );
                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "flex justify-center",
                                        index === 0 &&
                                            item.id === "home" &&
                                            "mb-3 border-b border-sidebar-border/70 pb-3",
                                    )}
                                >
                                    <NavHint
                                        trigger={trigger}
                                        item={item}
                                        rail
                                    />
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <>
                        <p className="px-2.5 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                            Navigation
                        </p>
                        <div className="space-y-1">
                            {items.map((item) => (
                                <SidebarNode
                                    key={item.id}
                                    item={item}
                                    level={0}
                                    controls={controls}
                                    onNavigate={onNavigate}
                                    pathname={pathname}
                                    search={search}
                                />
                            ))}
                        </div>
                    </>
                )}
            </nav>
        </TooltipProvider>
    );
}
