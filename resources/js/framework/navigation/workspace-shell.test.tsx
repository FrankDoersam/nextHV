import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
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
    collection: { renderer: "grid" },
} as ResourceDefinition;

beforeEach(() => {
    window.localStorage.clear();
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
        "matchMedia",
        vi.fn().mockImplementation((query: string) => ({
            matches: window.innerWidth < 768,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    );
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

function mount(
    path = "/properties/12",
    onLogout = vi.fn(),
    resources = [propertyResource],
) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <QueryClientProvider
                client={
                    new QueryClient({
                        defaultOptions: { queries: { retry: false } },
                    })
                }
            >
                <AppShell
                    resources={resources}
                    user={{
                        id: 42,
                        name: "Beispiel",
                        email: "team@example.test",
                    }}
                    onLogout={onLogout}
                >
                    <div>Arbeitsinhalt</div>
                </AppShell>
            </QueryClientProvider>
        </MemoryRouter>,
    );
}

it("places branding and a readable location breadcrumb in the shared header", () => {
    const { container } = mount();
    const sidebar = container.querySelector('[data-slot="desktop-sidebar"]');
    const topbar = container.querySelector('[data-slot="shell-header"]');
    expect(sidebar).not.toBeNull();
    expect(topbar).not.toBeNull();
    expect(sidebar).not.toContainElement(
        screen.getAllByRole("link", { name: "nextHV Startseite" })[0],
    );
    expect(topbar).toContainElement(
        screen.getAllByRole("link", { name: "nextHV Startseite" })[0],
    );
    const breadcrumb = screen.getByRole("navigation", { name: "Seitenpfad" });
    expect(breadcrumb).toHaveTextContent("Stammdaten");
    expect(breadcrumb).toHaveTextContent("Objekte");
    expect(breadcrumb).toHaveTextContent("#12");
});

it.each([
    ["units", "grid", "grid"],
    ["contracts", "table", "collection"],
] as const)(
    "uses the registered %s renderer instead of a property-specific layout",
    (name, renderer, mode) => {
        const resource = {
            ...propertyResource,
            name,
            collection: { renderer },
        };
        const { container } = mount(`/${name}`, vi.fn(), [resource]);
        expect(
            container.querySelector('[data-slot="page-wrapper"]'),
        ).toHaveAttribute("data-mode", mode);
    },
);

it.each([
    ["/enterprise-demo/objekte-einheiten", "grid"],
    ["/enterprise-demo/finanzen", "grid"],
    ["/enterprise-demo/zahlungen-op", "grid"],
    ["/properties", "grid"],
    ["/properties/12", "page"],
    ["/reui-timeline-demo", "page"],
])("uses one %s page wrapper with the %s layout mode", (path, mode) => {
    const { container } = mount(path);
    const wrappers = container.querySelectorAll('[data-slot="page-wrapper"]');

    expect(wrappers).toHaveLength(1);
    expect(wrappers[0]).toHaveAttribute("data-mode", mode);
    expect(wrappers[0]).toContainElement(screen.getByText("Arbeitsinhalt"));
});

it("collapses and expands the desktop rail without losing the current page", async () => {
    const { container } = mount();
    const user = userEvent.setup();
    const sidebar = container.querySelector('[data-slot="desktop-sidebar"]')!;

    await user.click(
        screen.getByRole("button", { name: "Navigation einklappen" }),
    );
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem("nexthv.sidebar.compact")).toBe("1");
    expect(
        container.querySelector('[data-slot="shell-header"]'),
    ).toContainElement(
        screen.getByRole("button", { name: "Navigation ausklappen" }),
    );
    expect(
        sidebar.querySelector('[data-slot="sidebar-header"]'),
    ).toContainElement(
        screen.getByRole("button", { name: "Datensätze suchen" }),
    );
    // Collapsed navigation displays groups, and the group click opens the rail.
    expect(
        screen.getByRole("button", { name: "Stammdaten Untermenü öffnen" }),
    ).toBeVisible();
    await user.click(
        screen.getByRole("button", { name: "Stammdaten Untermenü öffnen" }),
    );
    expect(sidebar).not.toHaveAttribute("data-collapsed");
    expect(
        screen.getByRole("navigation", { name: "Hauptnavigation" }),
    ).toHaveTextContent("Objekte");
    expect(
        screen.getByRole("navigation", { name: "Seitenpfad" }),
    ).toHaveTextContent("#12");
});

it("opens the shared command palette from the sidebar search", async () => {
    mount("/");
    await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Datensätze suchen" }));
    expect(
        await screen.findByRole("dialog", { name: "Datensätze suchen" }),
    ).toBeVisible();
});

it("opens labelled mobile navigation and closes it after choosing a destination", async () => {
    vi.stubGlobal("innerWidth", 390);
    const { container } = mount();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Menü öffnen" }));
    const navigation = await screen.findByRole("dialog", {
        name: "Navigation",
    });
    expect(
        within(navigation).getByRole("button", { name: "Abmelden" }),
    ).toBeVisible();
    await user.click(
        within(navigation).getByRole("link", { name: "Objekte" }),
    );

    await waitFor(() =>
        expect(
            screen.queryByRole("dialog", { name: "Navigation" }),
        ).not.toBeInTheDocument(),
    );
    expect(
        container.querySelector('[data-slot="page-wrapper"]'),
    ).toHaveAttribute("data-mode", "grid");
    expect(
        screen.getByRole("button", { name: "Datensätze suchen" }),
    ).toBeVisible();
});

it("searches server records and never filters matches again by their captions", async () => {
    const fetcher = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                data: [
                    {
                        resource: "units",
                        label: "Einheiten",
                        total: 1,
                        items: [
                            {
                                id: 1,
                                title: "Wohnung 01",
                                subtitle: "Lindenhof · E-01",
                                url: "/units/1",
                            },
                        ],
                    },
                ],
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    mount("/");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Datensätze suchen" }));
    expect(fetcher).not.toHaveBeenCalled();
    await user.type(
        screen.getByRole("combobox", { name: "Datensätze suchen" }),
        "Lindenhof",
    );
    expect(await screen.findByText("Wohnung 01")).toBeVisible();
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/global-search");
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

it("keeps a single REUI-aligned user footer without components or language controls", async () => {
    const logout = vi.fn();
    const { container } = mount("/", logout);
    const sidebar = container.querySelector('[data-slot="desktop-sidebar"]')!;
    const footer = sidebar.querySelector('[data-slot="sidebar-account"]')!;
    const account = footer.querySelector('[data-slot="sidebar-user"]')!;
    const avatar = account.querySelector('[data-slot="avatar"]')!;
    const initials = avatar.querySelector('[data-slot="avatar-fallback"]')!;

    expect(footer).toHaveTextContent("Beispiel");
    expect(footer).toHaveTextContent("team@example.test");
    expect(avatar).toHaveAttribute("aria-label", "Beispiel");
    expect(initials.className).toContain("bg-primary");
    expect(initials).toHaveTextContent("B");
    expect(sidebar.querySelector('a[href="/components"]')).toBeNull();
    expect(
        sidebar.querySelector('[aria-label="Sprache / Language"]'),
    ).toBeNull();
    await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Abmelden" }));
    expect(logout).toHaveBeenCalledOnce();
});

it("keeps the account avatar and logout accessible in the compact icon rail", async () => {
    const { container } = mount("/");
    const user = userEvent.setup();
    await user.click(
        screen.getByRole("button", { name: "Navigation einklappen" }),
    );
    const sidebar = container.querySelector('[data-slot="desktop-sidebar"]')!;
    const footer = sidebar.querySelector('[data-slot="sidebar-account"]')!;
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(footer.querySelector('[data-slot="avatar"]')).not.toBeNull();
    expect(footer).not.toHaveTextContent("team@example.test");
    expect(
        footer.querySelector('button[aria-label="Abmelden"]'),
    ).not.toBeNull();
});
