import { Badge, type BadgeProps } from "@/components/reui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface WizardTab {
    value: string;
    label: string;
    badge?: { value: string | number; variant?: BadgeProps["variant"]; size?: BadgeProps["size"] };
}

/** ReUI line tabs; badge is intentionally optional for each step. */
export function WizardTabsNavigation({
    steps,
    unlockedStep,
}: {
    steps: WizardTab[];
    unlockedStep: number;
}) {
    return (
        <div className="w-full overflow-x-auto">
            <TabsList variant="line" className="mb-3.5 w-full min-w-max justify-start gap-2 border-b border-border">
                {steps.map((step, index) => (
                    <TabsTrigger
                        key={step.value}
                        value={step.value}
                        className="gap-2"
                        disabled={index + 1 > unlockedStep}
                    >
                        {step.label}
                        {step.badge && (
                            <Badge variant={step.badge.variant ?? "primary-light"} size={step.badge.size ?? "sm"}>
                                {step.badge.value}
                            </Badge>
                        )}
                    </TabsTrigger>
                ))}
            </TabsList>
        </div>
    );
}
