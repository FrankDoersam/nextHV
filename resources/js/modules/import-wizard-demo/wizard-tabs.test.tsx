import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WizardTabsNavigation } from "./wizard-tabs";

afterEach(cleanup);

describe("Nova line wizard tabs", () => {
    it("renders optional ReUI badge props and keeps future steps disabled", () => {
        render(
            <Tabs defaultValue="1">
                <WizardTabsNavigation
                    unlockedStep={1}
                    steps={[
                        { value: "1", label: "Inbox", badge: { value: 12, variant: "primary-light", size: "lg" } },
                        { value: "2", label: "Drafts", badge: { value: 3, variant: "info-light" } },
                        { value: "3", label: "Sent" },
                    ]}
                />
                <TabsContent value="1">First page</TabsContent>
                <TabsContent value="2">Second page</TabsContent>
                <TabsContent value="3">Third page</TabsContent>
            </Tabs>,
        );

        expect(screen.getByRole("tablist")).toHaveAttribute("data-variant", "line");
        expect(screen.getByRole("tab", { name: /Inbox.*12/ })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("12", { selector: '[data-slot="badge"]' })).toHaveClass("h-5.5");
        expect(screen.getByText("3", { selector: '[data-slot="badge"]' })).toHaveClass("h-4.5");
        expect(screen.getByRole("tab", { name: /Drafts.*3/ })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("tab", { name: "Sent" })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByText("First page")).toBeVisible();
    });
});
