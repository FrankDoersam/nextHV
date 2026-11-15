import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LazyTabs } from "./lazy-tabs";

beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
        observe() {}
        disconnect() {}
    });
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("renders detail tab content only when selected, not on the initial page load", async () => {
    const overview = vi.fn(() => <div>Übersicht geladen</div>);
    const related = vi.fn(() => <div>Einheiten geladen</div>);
    render(
        <MemoryRouter initialEntries={["/properties/1"]}>
            <LazyTabs
                tabs={[
                    { id: "overview", label: "Übersicht", render: overview },
                    { id: "units", label: "Einheiten", count: 42, render: related },
                ]}
            />
        </MemoryRouter>,
    );
    expect(overview).toHaveBeenCalledOnce();
    expect(related).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("tab", { name: /Einheiten/ }));
    expect(related).toHaveBeenCalledOnce();
    expect(screen.getByText("Einheiten geladen")).toBeVisible();
});
