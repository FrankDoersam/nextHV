import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Building2 } from "lucide-react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ResourceDefinition } from "@/framework/types";
import { AppShell } from "./layout";
import { navigationGroups } from "@/modules/navigation";

const property = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "",
    icon: Building2,
    navigationGroup: "Stammdaten",
    titleField: "name",
    actions: [],
    fields: [],
    columns: [],
} as ResourceDefinition;

beforeEach(() => {
    window.localStorage.clear();
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.getAnimations = vi.fn(() => []);
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockReturnValue({
            matches: false, addEventListener() {}, removeEventListener() {},
        }),
    });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function mount(path = "/properties") {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <QueryClientProvider client={new QueryClient({
                defaultOptions: { queries: { retry: false } },
            })}>
                <AppShell
                    resources={[property]}
                    navigationGroups={navigationGroups}
                    user={{ id: 8, name: "Verwaltung Demo", email: "demo@example.test" }}
                    onLogout={vi.fn()}
                >
                    <p>Inhalt</p>
                </AppShell>
            </QueryClientProvider>
        </MemoryRouter>,
    );
}

it("keeps the workspace brand in the sidebar and renders a concise, distinct breadcrumb", () => {
    const { container } = mount();
    const sidebar = container.querySelector('[data-slot="shell-sidebar"]')!;
    const header = container.querySelector('[data-slot="shell-header"]')!;
    const breadcrumb = within(header as HTMLElement).getByRole("navigation", { name: "Seitenpfad" });

    expect(sidebar).toContainElement(screen.getByRole("link", { name: "nextHV Startseite" }));
    expect(within(header as HTMLElement).queryByRole("link", { name: "nextHV Startseite" })).not.toBeInTheDocument();
    expect(breadcrumb).toHaveTextContent("Stammdaten");
    expect(breadcrumb).toHaveTextContent("Objekte");
    expect(within(breadcrumb).getByText("Objekte")).toHaveAttribute("aria-current", "page");
    expect(within(header as HTMLElement).getByRole("button", { name: "Bereich suchen" })).toBeVisible();
});

it("collapses the sidebar to one icon per group and restores the full navigation", async () => {
    const { container } = mount();
    const user = userEvent.setup();
    const sidebar = container.querySelector('[data-slot="shell-sidebar"]')!;
    await user.click(screen.getByRole("button", { name: "Navigation umschalten" }));

    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem("nexthv.sidebar.compact")).toBe("1");
    expect(screen.getByRole("button", { name: "Stammdaten Untermenü öffnen" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stammdaten Untermenü öffnen" }));
    expect(sidebar).not.toHaveAttribute("data-collapsed");
    expect(within(sidebar as HTMLElement).getByRole("link", { name: "Objekte" })).toBeVisible();
});
