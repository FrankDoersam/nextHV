import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { useSearchParams } from "react-router";
export interface LazyTab {
    id: string;
    label: string;
    count?: number | null;
    icon?: LucideIcon;
    render: () => ReactNode;
}
export function LazyTabs({
    tabs,
    initial = "overview",
    urlKey = "tab",
    icons = true,
}: {
    tabs: LazyTab[];
    initial?: string;
    urlKey?: string;
    icons?: boolean;
}) {
    const [params, setParams] = useSearchParams();
    const selected = params.get(urlKey) ?? initial;
    const active = tabs.some((t) => t.id === selected) ? selected : initial;
    return (
        <Tabs
            value={active}
            onValueChange={(v) =>
                setParams((current) => {
                    const next = new URLSearchParams(current);
                    if (String(v) === initial) next.delete(urlKey);
                    else next.set(urlKey, String(v));
                    return next;
                })
            }
        >
            <div className="w-full min-w-0 max-w-full border-b">
                <TabsList
                    responsive
                    variant="line"
                    className="h-11 min-w-0 gap-1"
                >
                    {tabs.map((tab) => (
                        <TabsTrigger
                            key={tab.id}
                            value={tab.id}
                            icon={tab.icon}
                            icons={icons}
                        >
                            {tab.label}
                            {tab.count != null && (
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground tabular-nums in-data-active:bg-primary/10 in-data-active:text-primary">
                                    {tab.count}
                                </span>
                            )}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>
            {tabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id}>
                    {active === tab.id && tab.render()}
                </TabsContent>
            ))}
        </Tabs>
    );
}
