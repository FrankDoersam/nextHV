import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Building2, Archive, CircleCheck } from "lucide-react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { dataProvider } from "../data/provider";
import { CollectionViews } from "../tables/collection-views";
import type { ResourceDefinition } from "../types";
import { defaultNavigation, resolveNavigation } from "./sidebar-model";
import { SidebarNavigation, useSidebarExpansion } from "./sidebar";

const properties = {
    name: "properties",
    label: "Objekte",
    icon: Building2,
    navigationGroup: "Stammdaten",
    views: [
        { id: "all", label: "Alle", count: false },
        {
            id: "active",
            label: "Aktiv",
            count: true,
            filters: [{ field: "status", value: "active" }],
        },
        {
            id: "archived",
            label: "Inaktiv",
            count: true,
            filters: [{ field: "status", value: "archived" }],
        },
    ],
    navigationItem: {
        defaultOpen: true,
        children: [
            {
                id: "active",
                label: "Aktiv",
                icon: CircleCheck,
                view: "active",
                count: true,
            },
            {
                id: "archived",
                label: "Inaktiv",
                icon: Archive,
                view: "archived",
                count: true,
            },
        ],
    },
} as ResourceDefinition;
const tree = resolveNavigation(defaultNavigation([properties]), [properties]);

beforeEach(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            disconnect() {}
            unobserve() {}
        },
    );
    window.localStorage.clear();
    vi.spyOn(dataProvider, "list").mockImplementation(
        async (_, params = {}) => ({
            data: [],
            total:
                params?.filters?.[0] &&
                "field" in params.filters[0] &&
                params.filters[0].value === "active"
                    ? 7
                    : 3,
            current_page: 1,
            last_page: 1,
        }),
    );
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function SidebarExample({
    rail = false,
    onExpandRail = () => {},
}: {
    rail?: boolean;
    onExpandRail?: () => void;
}) {
    const controls = useSidebarExpansion(tree, 42);
    return (
        <SidebarNavigation
            items={tree}
            rail={rail}
            controls={controls}
            onNavigate={() => {}}
            onExpandRail={onExpandRail}
        />
    );
}

function mount(rail = false, onExpandRail = () => {}) {
    return render(
        <MemoryRouter initialEntries={["/properties?view=active"]}>
            <QueryClientProvider
                client={
                    new QueryClient({
                        defaultOptions: { queries: { retry: false } },
                    })
                }
            >
                <SidebarExample rail={rail} onExpandRail={onExpandRail} />
                <CollectionViews
                    resource={properties}
                    views={properties.views!}
                    active="active"
                    fixedFilters={[]}
                    panelId="properties-panel"
                    onChange={() => {}}
                />
            </QueryClientProvider>
        </MemoryRouter>,
    );
}

it("shows active and archived sidebar badges and reuses tab count requests", async () => {
    mount();

    const active = await screen.findByRole("link", { name: /Aktiv\s*7/ });
    const archived = screen.getByRole("link", { name: /Inaktiv\s*3/ });
    expect(active).toHaveAttribute("href", "/properties?view=active");
    expect(active).toHaveAttribute("aria-current", "page");
    expect(archived).toHaveAttribute("href", "/properties?view=archived");
    expect(archived).not.toHaveAttribute("aria-current");
    await waitFor(() => expect(dataProvider.list).toHaveBeenCalledTimes(2));
    expect(dataProvider.list).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
            filters: [{ field: "status", value: "active" }],
            limit: 10,
        }),
        expect.any(AbortSignal),
    );
});

it("toggles nested disclosure and retains the user's expansion preference", async () => {
    mount();
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", {
        name: "Objekte Unterpunkte einklappen",
    });

    await user.click(toggle);
    expect(
        screen.getByRole("button", { name: "Objekte Unterpunkte ausklappen" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
        JSON.parse(
            window.localStorage.getItem("nexthv.sidebar.expanded.v1.42") ??
                "{}",
        ),
    ).toHaveProperty("properties", false);
});

it("lets the icon rail open a parent's subtree and preserves labelled controls", async () => {
    const expand = vi.fn();
    mount(true, expand);
    const opener = screen.getByRole("button", {
        name: "Stammdaten Untermenü öffnen",
    });
    expect(screen.queryByRole("button", { name: "Objekte Untermenü öffnen" })).not.toBeInTheDocument();

    await userEvent.setup().click(opener);
    expect(expand).toHaveBeenCalledOnce();
    expect(
        JSON.parse(
            window.localStorage.getItem("nexthv.sidebar.expanded.v1.42") ?? "{}",
        ),
    ).toHaveProperty("group:Stammdaten", true);
});

it("uses a quiet full-row REUI selection without the old half-round left marker", () => {
    mount();
    const link = screen.getByRole("link", { name: /Aktiv\s*7/ });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveAttribute("data-active", "true");
    expect(link.className).toContain("bg-primary/");
    expect(link.className).not.toContain("border-l-2");
    expect(link.className).not.toContain("rounded-r-full");

    const section = screen.getByRole("button", { name: "Stammdaten" });
    expect(section).toHaveAttribute("data-slot", "sidebar-group-trigger");
    expect(section).toHaveAttribute("data-branch-active", "true");
    expect(section.querySelector("svg")).not.toBeNull();
    expect(section).toHaveAttribute("aria-expanded", "true");
});

it("keeps rail navigation to one icon per group without a corner chevron or dot", () => {
    mount(true);
    const group = screen.getByRole("button", {
        name: "Stammdaten Untermenü öffnen",
    });
    expect(group).toHaveAttribute("data-slot", "sidebar-rail-group");
    expect(group).toHaveAttribute("aria-pressed", "true");
    expect(group.querySelectorAll("svg")).toHaveLength(1);
    expect(group.querySelector(".lucide-chevron-right")).toBeNull();
    expect(group.querySelector(".lucide-circle")).toBeNull();
    expect(
        screen.queryByRole("button", { name: "Objekte Untermenü öffnen" }),
    ).not.toBeInTheDocument();
});
