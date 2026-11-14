import { Collapsible } from "@base-ui/react/collapsible";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, PanelLeftOpen } from "lucide-react";
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
            item.defaultOpen ??
            navigationBranchActive(item, pathname, search),
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
    const Icon = item.icon;

    const label = (
        <>
            {Icon && (
                <Icon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
            )}
            <span className="min-w-0 flex-1 truncate text-left">
                <span className="block truncate">{item.label}</span>
                {item.description && (
                    <span className="block truncate text-[10px] font-normal text-muted-foreground">
                        {item.description}
                    </span>
                )}
            </span>
        </>
    );
    const rowClasses = cn(
        "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
            ? "bg-muted font-medium text-foreground"
            : branchActive
              ? "font-medium text-foreground hover:bg-muted/70"
              : "text-foreground/80 hover:bg-muted/70 hover:text-foreground",
        item.disabledReason && "cursor-not-allowed opacity-50",
    );
    const link =
        item.to && !item.disabledReason ? (
            <Link
                to={item.to}
                data-slot="sidebar-link"
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
                <NavBadge item={item} />
            </span>
        ) : null;

    if (!hasChildren) {
        return link ? (
            <div data-slot="sidebar-item" data-level={level} key={item.id}>
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
            className={cn("min-w-0", level === 0 && "pt-3 first:pt-0")}
        >
            {link ? (
                <div className="flex min-w-0 items-center gap-1">
                    <div className="min-w-0 flex-1">
                        <NavHint trigger={link} item={item} rail={false} />
                    </div>
                    <Collapsible.Trigger
                        aria-label={`${item.label} Unterpunkte ${open ? "einklappen" : "ausklappen"}`}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <ChevronRight
                            className={cn(
                                "size-3.5 transition-transform",
                                open && "rotate-90",
                            )}
                        />
                    </Collapsible.Trigger>
                </div>
            ) : (
                <Collapsible.Trigger
                    className="flex w-full min-h-8 items-center justify-between gap-2 rounded-md px-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={item.tooltip ?? item.description}
                >
                    <span className="truncate">{item.label}</span>
                    <ChevronRight
                        className={cn(
                            "size-3 shrink-0 transition-transform",
                            open && "rotate-90",
                        )}
                    />
                </Collapsible.Trigger>
            )}
            <Collapsible.Panel
                className={cn("min-w-0", level > 0 && "ml-4 border-l pl-2")}
            >
                <div className="space-y-0.5 pt-1">
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

/** REUI-inspired sidebar: accessible disclosure levels, badges, compact rail and mobile reuse one model. */
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
    const railItems = items.flatMap((item) =>
        item.children.length && !item.to ? item.children : [item],
    );
    return (
        <TooltipProvider delay={250}>
            <nav
                aria-label="Hauptnavigation"
                data-slot="sidebar-navigation"
                className={cn(
                    "min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4",
                    rail && "px-2",
                )}
            >
                {!rail && (
                    <p className="px-2.5 pb-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Arbeitsbereich
                    </p>
                )}
                {rail ? (
                    <div className="space-y-1">
                        {railItems.map((item, index) => {
                            const Icon = item.icon;
                            if (!Icon) return null;
                            const selected = navigationBranchActive(
                                item,
                                pathname,
                                search,
                            );
                            const trigger = item.disabledReason ? (
                                <span
                                    role="link"
                                    aria-disabled="true"
                                    tabIndex={0}
                                    aria-label={item.label}
                                    className="flex size-10 items-center justify-center rounded-lg opacity-50"
                                >
                                    <Icon className="size-4" />
                                </span>
                            ) : item.children.length ? (
                                <button
                                    type="button"
                                    aria-label={`${item.label} Untermenü öffnen`}
                                    onClick={onExpandRail}
                                    className={cn(
                                        "flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        selected && "bg-muted text-foreground",
                                    )}
                                >
                                    <Icon className="size-4" />
                                    <PanelLeftOpen className="ml-0.5 size-2.5" />
                                </button>
                            ) : (
                                <Link
                                    to={item.to ?? "/"}
                                    onClick={onNavigate}
                                    aria-label={item.label}
                                    aria-current={selected ? "page" : undefined}
                                    className={cn(
                                        "flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        selected && "bg-muted text-foreground",
                                    )}
                                >
                                    <Icon className="size-4" />
                                </Link>
                            );
                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "flex justify-center",
                                        index > 0 &&
                                            item.id !== "home" &&
                                            "first:border-t",
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
                    <div className="space-y-0.5">
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
                )}
            </nav>
        </TooltipProvider>
    );
}
