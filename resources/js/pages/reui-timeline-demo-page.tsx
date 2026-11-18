import { PageHeader } from "@/components/blocks/layout";
import { ReuiTimelineDemo } from "@/components/examples/timeline-2";

export default function ReuiTimelineDemoPage() {
    return (
        <section
            data-slot="reui-timeline-demo-page"
            className="flex min-w-0 flex-col gap-5"
        >
            <PageHeader
                eyebrow="ReUI · Base UI · Demo"
                title="Timeline 2"
                description="Aktivitätsverlauf mit Dateianhängen, Bewertung und Status-Badges."
            />
            <div className="flex w-full justify-center py-6 sm:py-10">
                <ReuiTimelineDemo />
            </div>
        </section>
    );
}
