import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Building2 } from "lucide-react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppShell } from "@/components/blocks/layout";
import type { ResourceDefinition } from "../types";

const propertyResource = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "",
    navigationGroup: "Stammdaten",
    icon: Building2,
    titleField: "name",
    fields: [],
    columns: [],
    actions: [],
} as ResourceDefinition;

beforeEach(() => {
    window.localStorage.clear();
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            disconnect() {}
            unobserve() {}
        },
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

function mount(path = "/properties/12") {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <QueryClientProvider
                client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
            >
                <AppShell
                    resources={[propertyResource]}
                    user={{ id: 42, name: "Beispiel", email: "team@example.test" }}
                    onLogout={vi.fn()}
                >
                    <div>Arbeitsinhalt</div>
                </AppShell>
            </QueryClientProvider>
        </MemoryRouter>,
    );
}

it("places branding in the sidebar and shows a readable location breadcrumb", () => {
    const { container } = mount();
    const sidebar = container.querySelector('[data-slot="desktop-sidebar"]');
    const topbar = container.querySelector('[data-slot="shell-header"]');
    expect(sidebar).not.toBeNull();
    expect(topbar).not.toBeNull();
    expect(sidebar).toContainElement(screen.getAllByRole("link", { name: "nextHV Startseite" })[0]);
    expect(topbar).not.toContainElement(screen.getAllByRole("link", { name: "nextHV Startseite" })[0]);
    const breadcrumb = screen.getByRole("navigation", { name: "Seitenpfad" });
    expect(breadcrumb).toHaveTextContent("Stammdaten");
    expect(breadcrumb).toHaveTextContent("Objekte");
    expect(breadcrumb).toHaveTextContent("#12");
});

it("collapses and expands the desktop rail without losing the current page", async () => {
    const { container } = mount();
    const user = userEvent.setup();
    const sidebar = container.querySelector('[data-slot="desktop-sidebar"]')!;

    await user.click(screen.getByRole("button", { name: "Navigation einklappen" }));
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem("nexthv.sidebar.compact")).toBe("1");
    await user.click(screen.getByRole("button", { name: "Navigation ausklappen" }));
    expect(sidebar).not.toHaveAttribute("data-collapsed");
    expect(screen.getByRole("navigation", { name: "Seitenpfad" })).toHaveTextContent("#12");
});

it("opens the shared command palette from the topbar", async () => {
    mount("/");
    await userEvent.setup().click(screen.getByRole("button", { name: "Bereiche suchen" }));
    expect(await screen.findByRole("dialog", { name: "Bereich öffnen" })).toBeVisible();
});
