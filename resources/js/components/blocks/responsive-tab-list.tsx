import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface NavigationTab {
    id: string;
    label: string;
    count?: number | null;
    icon?: LucideIcon;
    domId?: string;
}

const itemStyle =
    "inline-flex h-11 shrink-0 items-center justify-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0";

function TabLabel({ tab, icons }: { tab: NavigationTab; icons: boolean }) {
    const Icon = tab.icon;
    return (
        <>
            {icons && Icon && <Icon aria-hidden />}
            <span className="min-w-0 truncate">{tab.label}</span>
            {tab.count != null && (
                <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground tabular-nums">
                    {tab.count}
                </span>
            )}
        </>
    );
}

/** One line at every container width; the current section always stays visible. */
export function ResponsiveTabList({
    tabs,
    active,
    onChange,
    icons = true,
    ariaLabel = "Bereiche",
    panelId,
    moreLabel = "Weitere Bereiche",
}: {
    tabs: NavigationTab[];
    active: string;
    onChange: (id: string) => void;
    icons?: boolean;
    ariaLabel?: string;
    panelId?: string;
    moreLabel?: string;
}) {
    const container = useRef<HTMLDivElement>(null);
    const measure = useRef<HTMLDivElement>(null);
    const [visibleIds, setVisibleIds] = useState<string[]>(() =>
        tabs.map((tab) => tab.id),
    );
    // Labels/counts may change after a mutation; observe their actual rendered width.
    const signature = tabs
        .map((tab) => `${tab.id}:${tab.label}:${tab.count}:${!!tab.icon}`)
        .join("|");
    useLayoutEffect(() => {
        const root = container.current!;
        const ruler = measure.current!;
        const update = () => {
            const available = root.clientWidth;
            if (!available) return;
            const nodes = Array.from(ruler.children) as HTMLElement[];
            const widths = nodes
                .slice(0, -1)
                .map((node) => node.getBoundingClientRect().width);
            const moreWidth = nodes.at(-1)!.getBoundingClientRect().width;
            const ids = tabs.map((tab) => tab.id);
            let next = ids;
            if (widths.reduce((sum, width) => sum + width, 0) > available) {
                const current = Math.max(0, ids.indexOf(active));
                const chosen = new Set([current]);
                let used = widths[current] + moreWidth;
                for (let index = 0; index < ids.length; index++) {
                    if (index === current) continue;
                    if (used + widths[index] > available) break;
                    used += widths[index];
                    chosen.add(index);
                }
                next = ids.filter((_, index) => chosen.has(index));
            }
            setVisibleIds((previous) =>
                previous.join("|") === next.join("|") ? previous : next,
            );
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(root);
        observer.observe(ruler);
        return () => observer.disconnect();
    }, [signature, active, icons]);

    const visible = tabs.filter(
        (tab) => visibleIds.includes(tab.id) || tab.id === active,
    );
    const overflow = tabs.filter(
        (tab) => !visible.some((item) => item.id === tab.id),
    );
    return (
        <div
            ref={container}
            data-slot="section-navigation"
            className="relative flex w-full min-w-0 items-center border-b"
        >
            <div
                aria-hidden
                className="pointer-events-none invisible absolute inset-x-0 top-0 overflow-hidden"
                inert
            >
                <div ref={measure} className="flex w-max max-w-none">
                    {tabs.map((tab) => (
                        <span key={tab.id} className={itemStyle}>
                            <TabLabel tab={tab} icons={icons} />
                        </span>
                    ))}
                    <span className="inline-flex h-11 items-center gap-2 px-3 text-sm font-medium">
                        Weitere <ChevronDown className="size-4" />
                    </span>
                </div>
            </div>
            <TabsList
                variant="line"
                aria-label={ariaLabel}
                className="min-w-0 shrink gap-0 data-[orientation=horizontal]:h-11"
            >
                {visible.map((tab) => (
                    <TabsTrigger
                        key={tab.id}
                        value={tab.id}
                        id={tab.domId}
                        aria-controls={panelId}
                        className={cn(
                            itemStyle,
                            "min-w-0 shrink group-data-[variant=line]/tabs-list:data-active:text-foreground after:bg-foreground",
                        )}
                    >
                        <TabLabel tab={tab} icons={icons} />
                    </TabsTrigger>
                ))}
            </TabsList>
            {!!overflow.length && (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="ghost"
                                className="h-11 shrink-0 gap-2 rounded-none px-3 text-muted-foreground"
                                aria-label={moreLabel}
                            />
                        }
                    >
                        Weitere <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-72 max-w-[calc(100vw-2rem)]"
                    >
                        {overflow.map((tab) => (
                            <DropdownMenuItem
                                key={tab.id}
                                onClick={() => onChange(tab.id)}
                                className="gap-2 px-3 py-2.5"
                            >
                                <TabLabel tab={tab} icons={icons} />
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
}
