import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LazyTabs } from "./lazy-tabs";

const originalObserver = global.ResizeObserver;
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    global.ResizeObserver = originalObserver;
});

function Location() {
    return <output aria-label="Adresse">{useLocation().search}</output>;
}

describe("responsive section navigation", () => {
    it("opens overflow sections lazily, preserves URL filters and keeps the selected section visible after resize", async () => {
        let width = 250;
        let resize = () => {};
        global.ResizeObserver = class {
            constructor(private callback: ResizeObserverCallback) {}
            observe(element: Element) {
                if (element.getAttribute("data-slot") === "section-navigation")
                    resize = () => this.callback([], this);
            }
            unobserve() {}
            disconnect() {}
        };
        vi.spyOn(
            HTMLElement.prototype,
            "clientWidth",
            "get",
        ).mockImplementation(() => width);
        vi.spyOn(
            HTMLElement.prototype,
            "getBoundingClientRect",
        ).mockReturnValue({
            width: 100,
            height: 44,
            x: 0,
            y: 0,
            top: 0,
            right: 100,
            bottom: 44,
            left: 0,
            toJSON: () => ({}),
        });
        Element.prototype.getAnimations = vi.fn(() => []);
        const load = vi.fn(() => <p>Konditionshistorie</p>);
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={["/?search=MV"]}>
                <LazyTabs
                    tabs={[
                        {
                            id: "overview",
                            label: "Übersicht",
                            render: () => <p>Stammdaten</p>,
                        },
                        {
                            id: "parties",
                            label: "Beteiligte",
                            render: () => <p>Mieter</p>,
                        },
                        {
                            id: "conditions",
                            label: "Konditionen",
                            count: 2,
                            render: load,
                        },
                    ]}
                />
                <Location />
            </MemoryRouter>,
        );
        expect(load).not.toHaveBeenCalled();
        expect(
            screen.queryByRole("tab", { name: /Konditionen/ }),
        ).not.toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: "Weitere Bereiche" }),
        );
        await user.click(
            await screen.findByRole("menuitem", { name: /Konditionen/ }),
        );

        expect(
            screen.getByRole("tab", { name: /Konditionen.*2/ }),
        ).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("Konditionshistorie")).toBeVisible();
        expect(screen.queryByText("Stammdaten")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Adresse")).toHaveTextContent(
            "?search=MV&tab=conditions",
        );
        act(() => {
            width = 500;
            resize();
        });
        expect(screen.getAllByRole("tab")).toHaveLength(3);
        expect(
            screen.queryByRole("button", { name: "Weitere Bereiche" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("tab", { name: /Konditionen.*2/ }),
        ).toHaveAttribute("aria-selected", "true");
    });

    it("opens the first configured section for an invalid deep link when there is no overview", () => {
        global.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
        render(
            <MemoryRouter initialEntries={["/?tab=removed"]}>
                <LazyTabs
                    tabs={[
                        {
                            id: "details",
                            label: "Details",
                            render: () => <p>Vertragsdaten</p>,
                        },
                    ]}
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(screen.getByText("Vertragsdaten")).toBeVisible();
    });
});
