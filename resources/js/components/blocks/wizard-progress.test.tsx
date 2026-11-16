import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { WizardProgress } from "./wizard-progress";

afterEach(cleanup);

it("keeps a compact, labelled REUI stepper and lets users revisit completed steps", async () => {
    const select = vi.fn();
    const { container } = render(
        <WizardProgress
            active={1}
            steps={[
                { id: "general", label: "Objekt" },
                { id: "address", label: "Adresse" },
                { id: "management", label: "Verwaltung" },
                { id: "details", label: "Gebäude & Hinweise" },
            ]}
            onSelect={select}
        />,
    );

    expect(screen.getByRole("navigation", { name: "Erfassungsschritte" })).toBeVisible();
    expect(screen.getByText("Schritt 2 von 4")).toBeVisible();
    expect(container.querySelector('[data-slot="wizard-progress"]')).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Erfassungsschritte" }))
        .toHaveTextContent("Schritt 2 von 4");
    // The REUI indicators communicate progress without a second fake bar.
    expect(container.querySelector('[data-slot="wizard-progress"] > .h-1')).toBeNull();
    expect(container.querySelectorAll('[data-slot="stepper-item"]')).toHaveLength(4);
    expect(container.querySelector('[data-slot="stepper"]')).toHaveAttribute(
        "aria-orientation",
        "horizontal",
    );
    expect(screen.getByRole("tab", { name: "Adresse, Schritt 2" })).toHaveAttribute(
        "aria-selected",
        "true",
    );
    expect(screen.getByRole("tab", { name: "Verwaltung, Schritt 3" })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Objekt, Schritt 1" }));
    expect(select).toHaveBeenCalledExactlyOnceWith(0);
});
