import { SectionCard } from "@/components/blocks/content";
import { Inline, PageHeader, Stack } from "@/components/blocks/layout";
import { Button } from "@/components/ui/button";
import { ResourceCollection } from "@/framework/tables/resource-collection";
import type { ResourceDefinition } from "@/framework/types";
import { useWorkbench } from "@/framework/workbench";
export default function ResourcePage({
    resource,
}: {
    resource: ResourceDefinition;
}) {
    const w = useWorkbench();
    return (
        <Stack>
            <PageHeader
                eyebrow="Verwaltung"
                title={resource.label}
                description={resource.description}
                actions={
                    <Inline>
                        <Button
                            variant={
                                w.presentation === "sheet"
                                    ? "secondary"
                                    : "ghost"
                            }
                            onClick={() => w.setPresentation("sheet")}
                        >
                            Sheet
                        </Button>
                        <Button
                            variant={
                                w.presentation === "dialog"
                                    ? "secondary"
                                    : "ghost"
                            }
                            onClick={() => w.setPresentation("dialog")}
                        >
                            Dialog
                        </Button>
                    </Inline>
                }
            />
            <SectionCard
                title={`${resource.label} verwalten`}
                description="Finde Datensätze, passe die Ansicht an und bearbeite mehrere Einträge gemeinsam."
            >
                <ResourceCollection resource={resource} />
            </SectionCard>
        </Stack>
    );
}
