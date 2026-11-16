import { PageHeader } from "@/components/blocks/layout";
import { BalanceTracker } from "@/modules/charts/balance-tracker";

/** Dedicated authenticated navigation page; chart state stays inside the module. */
export default function ChartsPage() {
    return (
        <div data-slot="charts-page" className="flex min-w-0 flex-col gap-5">
            <PageHeader
                title="Charts"
                description="ReUI Chart 4 · Portfolio-Balance als interaktive Diagramm-Demo."
            />
            <BalanceTracker />
        </div>
    );
}
