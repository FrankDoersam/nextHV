import type { ReactNode } from "react";
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
    return (
        <div
            className={
                variant === "main"
                    ? "grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)] [&>*]:min-w-0 [&>*:only-child]:col-span-full"
                    : "grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0"
            }
        >
            {children}
        </div>
    );
}
