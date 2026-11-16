import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
    CStepper10,
    CStepper10Content,
} from "./c-stepper-10";

afterEach(cleanup);

it("uses the installed ReUI c-stepper-10 pattern with a separate panel per step", async () => {
    const onSelect = vi.fn();
    const { container } = render(
        <CStepper10
            active={1}
            idPrefix="test-stepper"
            steps={[
                { id: "base", label: "Objekt", description: "Grunddaten" },
                { id: "address", label: "Adresse" },
                { id: "manage", label: "Verwaltung" },
            ]}
            onSelect={onSelect}
        >
            <CStepper10Content enabled step={1} active={1} idPrefix="test-stepper">
                <input aria-label="Objektname" defaultValue="Linden" />
            </CStepper10Content>
            <CStepper10Content enabled step={2} active={1} idPrefix="test-stepper">
                <p>Adresse erfassen</p>
            </CStepper10Content>
            <CStepper10Content enabled step={3} active={1} idPrefix="test-stepper">
                <p>Verwaltung erfassen</p>
            </CStepper10Content>
        </CStepper10>,
    );
    expect(container.querySelector('[data-slot="reui-c-stepper-10"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="stepper-panel"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="stepper-content"]')).toHaveLength(3);
    expect(screen.getByText("Schritt 2 von 3")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Adresse, Schritt 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Verwaltung, Schritt 3" })).toBeDisabled();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Adresse erfassen");
    expect(container.querySelector("#test-stepper-panel-1")).toHaveAttribute("hidden");
    expect(container.querySelector("#test-stepper-panel-1")).toHaveAttribute("aria-labelledby", "test-stepper-trigger-1");
    expect(screen.queryByRole("textbox", { name: "Objektname" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Objekt, Schritt 1" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(0);
});

it("passes through ordinary edit forms without a stepper", () => {
    const { container } = render(
        <CStepper10 enabled={false} active={0} steps={[]} >
            <p>Editor</p>
        </CStepper10>,
    );
    expect(screen.getByText("Editor")).toBeVisible();
    expect(container.querySelector('[data-slot="stepper"]')).toBeNull();
});
