import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, type ReactNode } from "react";
export interface LazyTab {
    id: string;
    label: string;
    count?: number | null;
    render: () => ReactNode;
}
export function LazyTabs({
    tabs,
    initial = "overview",
}: {
    tabs: LazyTab[];
    initial?: string;
}) {
    const [active, setActive] = useState(initial);
    return (
        <Tabs value={active} onValueChange={(v) => setActive(String(v))}>
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
