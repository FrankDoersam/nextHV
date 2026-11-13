import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ReactNode } from "react";
import { useSearchParams } from "react-router";
export interface LazyTab {
    id: string;
    label: string;
    count?: number | null;
    render: () => ReactNode;
}
export function LazyTabs({
    tabs,
    initial = "overview",
    urlKey = "tab",
}: {
    tabs: LazyTab[];
    initial?: string;
    urlKey?: string;
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
            <div className="overflow-x-auto border-b">
                <TabsList variant="line" className="h-12 min-w-max gap-4">
                    {tabs.map((tab) => (
                        <TabsTrigger key={tab.id} value={tab.id}>
                            {tab.label}
                            {tab.count != null && (
                                <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                                    {tab.count}
                                </span>
                            )}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>
            {tabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id} className="pt-5">
                    {active === tab.id && tab.render()}
                </TabsContent>
            ))}
        </Tabs>
    );
}
