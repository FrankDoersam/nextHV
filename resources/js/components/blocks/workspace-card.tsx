import type { ReactNode } from "react";
import { MetricCardGrid } from "./metric-card";
import { ContentCard } from "./content-card";
export function WorkspaceCard(props: React.ComponentProps<typeof ContentCard>) {
    return <ContentCard {...props} fill />;
}
export function WorkspaceColumns({
    children,
    variant = "main",
}: {
    children: ReactNode;
    variant?: "main" | "metrics";
}) {
    if (variant === "metrics")
        return <MetricCardGrid>{children}</MetricCardGrid>;
    return (
        <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)] [&>*]:min-w-0 [&>*:only-child]:col-span-full">
            {children}
        </div>
    );
}
