import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ResponsiveTabList } from "./responsive-tab-list";
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
    const active = tabs.some((t) => t.id === selected)
        ? selected
        : (tabs.find((t) => t.id === initial)?.id ?? tabs[0]?.id ?? "");
    const select = (id: string) =>
        setParams((current) => {
            const next = new URLSearchParams(current);
            if (id === initial) next.delete(urlKey);
            else next.set(urlKey, id);
            return next;
        });
    return (
        <Tabs value={active} onValueChange={(v) => select(String(v))}>
            <ResponsiveTabList
                tabs={tabs}
                active={active}
                onChange={select}
                icons={icons}
            />
            {tabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id}>
                    {active === tab.id && tab.render()}
                </TabsContent>
            ))}
        </Tabs>
    );
}
