import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
    CStepper10,
    CStepper10Content,
} from "./c-stepper-10";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

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
    expect(container.querySelectorAll('[data-slot="stepper-item"]')).toHaveLength(3);
    expect(container.querySelector('[data-slot="reui-stepper-10-scroll"]')).toBeInTheDocument();
    expect(container.querySelector('[data-step-count="3"]')).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Erfassungsschritte" })).toBeInTheDocument();
    // Progress counter lives next to the form heading, not twice inside the stepper.
    expect(screen.getByRole("tab", { name: "Adresse, Schritt 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Verwaltung, Schritt 3" })).toBeEnabled();
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

it("renders eight steps with independent rail scrolling and visible navigation affordances", async () => {
    const steps = Array.from({ length: 8 }, (_, index) => ({
        id: String(index),
        label: "Schritt " + (index + 1),
        shortLabel: "S" + (index + 1),
    }));
    const { container, rerender } = render(
        <CStepper10 active={0} steps={steps} onSelect={vi.fn()}>
            <p>Formular</p>
        </CStepper10>,
    );
    const scroll = container.querySelector<HTMLElement>('[data-slot="reui-stepper-10-scroll"]')!;
    Object.defineProperties(scroll, {
        clientWidth: { configurable: true, value: 300 },
        scrollWidth: { configurable: true, value: 1100 },
    });
    await act(async () => { window.dispatchEvent(new Event("resize")); });
    const user = userEvent.setup();
    const next = await screen.findByRole("button", { name: "Weitere Schritte anzeigen" });
    await user.click(next);
    expect(scroll.scrollLeft).toBeGreaterThan(0);
    await waitFor(() =>
        expect(screen.getByRole("button", { name: "Frühere Schritte anzeigen" })).toBeVisible(),
    );
    // Active changes also scroll the navigation into view without remounting the form.
    const last = container.querySelector<HTMLElement>('[data-current-step="true"]')!;
    expect(last).toBeInTheDocument();
    rerender(
        <CStepper10 active={7} steps={steps} onSelect={vi.fn()}>
            <p>Formular</p>
        </CStepper10>,
    );
    expect(container.querySelectorAll('[data-slot="stepper-item"]')).toHaveLength(8);
    expect(screen.getByRole("tab", { name: "Schritt 8, Schritt 8" })).toHaveAttribute(
        "aria-selected",
        "true",
    );
});

it("reveals the active step after container and viewport resizing while preserving manual scrolling", () => {
    let resizeContainer = () => {};
    vi.stubGlobal(
        "ResizeObserver",
        class {
            constructor(callback: ResizeObserverCallback) {
                resizeContainer = () =>
                    callback([], this as unknown as ResizeObserver);
            }
            observe() {}
            disconnect() {}
        },
    );
    const { container } = render(
        <CStepper10
            active={3}
            steps={[
                { id: "general", label: "Objekt" },
                { id: "address", label: "Adresse" },
                { id: "management", label: "Verwaltung" },
                { id: "details", label: "Gebäude & Hinweise" },
            ]}
            onSelect={vi.fn()}
        >
            <p>Gebäudedaten</p>
        </CStepper10>,
    );
    const scroll = container.querySelector<HTMLElement>(
        '[data-slot="reui-stepper-10-scroll"]',
    )!;
    const current = screen
        .getByRole("tab", { name: "Gebäude & Hinweise, Schritt 4" })
        .closest<HTMLElement>('[data-slot="stepper-item"]')!;
    let viewportWidth = 800;
    Object.defineProperties(scroll, {
        clientWidth: { configurable: true, get: () => viewportWidth },
        scrollWidth: { configurable: true, value: 800 },
    });
    vi.spyOn(scroll, "getBoundingClientRect").mockImplementation(
        () => new DOMRect(0, 0, viewportWidth, 40),
    );
    vi.spyOn(current, "getBoundingClientRect").mockImplementation(
        () => new DOMRect(600 - scroll.scrollLeft, 0, 160, 40),
    );
    scroll.scrollLeft = 0;

    viewportWidth = 390;
    act(resizeContainer);

    expect(current.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    expect(current.getBoundingClientRect().right).toBeLessThanOrEqual(
        viewportWidth,
    );

    act(() => {
        scroll.scrollLeft = 20;
        scroll.dispatchEvent(new Event("scroll"));
    });

    expect(scroll.scrollLeft).toBe(20);

    viewportWidth = 320;
    act(() => {
        window.dispatchEvent(new Event("resize"));
    });

    expect(current.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    expect(current.getBoundingClientRect().right).toBeLessThanOrEqual(
        viewportWidth,
    );
});
