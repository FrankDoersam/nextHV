import { Button } from "@/components/ui/button";
import { PanelRight, AppWindow } from "lucide-react";
import { useWorkbench } from "./workbench";
export function PresentationToggle() {
    const { presentation, setPresentation } = useWorkbench();
    return (
        <div
            role="group"
            aria-label="Formularansicht"
            className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5"
        >
            {(["sheet", "dialog"] as const).map((mode) => (
                <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={presentation === mode ? "secondary" : "ghost"}
                    aria-pressed={presentation === mode}
                    onClick={() => setPresentation(mode)}
                >
                    {mode === "sheet" ? <PanelRight /> : <AppWindow />}
                    {mode === "sheet" ? "Sheet" : "Dialog"}
                </Button>
            ))}
        </div>
    );
}
