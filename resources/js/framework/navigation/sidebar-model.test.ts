import { Building2, CircleCheck, Archive } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import type { ResourceDefinition } from "../types";
import {
    defaultNavigation,
    flattenNavigation,
    navigationBranchActive,
    navigationPath,
    navigationSelected,
    resolveNavigation,
    type NavigationItemDefinition,
} from "./sidebar-model";

const properties = {
    name: "properties",
    label: "Objekte",
    navigationGroup: "Stammdaten",
    icon: Building2,
    views: [
        { id: "all", label: "Alle" },
        { id: "active", label: "Aktiv", count: true, filters: [{ field: "status", value: "active" }] },
        { id: "archived", label: "Inaktiv", count: true, filters: [{ field: "status", value: "archived" }] },
    ],
    navigationItem: {
        defaultOpen: true,
        description: "Portfolio",
        children: [
            { id: "active", label: "Aktiv", view: "active", icon: CircleCheck, count: true },
            { id: "archived", label: "Inaktiv", view: "archived", icon: Archive, count: true },
        ],
    },
} as ResourceDefinition;

describe("sidebar navigation model", () => {
    it("reuses a single resource for all filtered paths and marks exactly the selected view", () => {
        const tree = resolveNavigation(defaultNavigation([properties]), [properties]);
        const entries = flattenNavigation(tree);
        const parent = entries.find((item) => item.id === "properties")!;
        const active = entries.find((item) => item.id === "active")!;
        const archived = entries.find((item) => item.id === "archived")!;

        expect(parent.to).toBe("/properties");
        expect(active.to).toBe("/properties?view=active");
        expect(archived.to).toBe("/properties?view=archived");
        expect(navigationSelected(active, "/properties", "?view=active")).toBe(true);
        expect(navigationSelected(archived, "/properties", "?view=active")).toBe(false);
        expect(navigationSelected(parent, "/properties", "?view=active")).toBe(false);
        expect(navigationSelected(parent, "/properties/12", "")).toBe(true);
        expect(navigationBranchActive(parent, "/properties", "?view=archived")).toBe(true);
        expect(navigationPath(tree, "/properties", "?view=active").map((item) => item.label)).toEqual([
            "Stammdaten", "Objekte", "Aktiv",
        ]);
    });

    it("keeps a tabbed resource active and its breadcrumb accurate without view children", () => {
        const contracts = {
            ...properties,
            name: "contracts",
            label: "Verträge",
            navigationGroup: "Vermietung",
            navigationItem: undefined,
            views: [
                { id: "all", label: "Alle" },
                { id: "active", label: "Aktiv" },
                { id: "draft", label: "Entwurf" },
            ],
        } as ResourceDefinition;
        const tree = resolveNavigation(defaultNavigation([contracts]), [contracts]);
        const parent = flattenNavigation(tree).find((item) => item.id === "contracts")!;
        expect(navigationSelected(parent, "/contracts", "?view=active")).toBe(true);
        expect(navigationSelected(parent, "/contracts", "?view=draft")).toBe(true);
        expect(navigationPath(tree, "/contracts", "?view=active").map((item) => item.label))
            .toEqual(["Vermietung", "Verträge"]);
    });

    it("allows visible/enabled callbacks with a reasoned permission decision", () => {
        const decide = vi.fn((resource: string, action: string) => {
            expect(resource).toBe("properties");
            return action === "list"
                ? { allowed: true }
                : { allowed: false, reason: "Nur lesen" };
        });
        const config: NavigationItemDefinition[] = [
            {
                id: "restricted", label: "Stammdaten", children: [
                    { id: "hidden", label: "Versteckt", resource: "properties", visible: false },
                    {
                        id: "read-only",
                        label: "Nur lesen",
                        resource: "properties",
                        visible: ({ user }) => user?.id === 7,
                        enabled: ({ can }) => can("properties", "edit") || "Nur lesender Zugriff",
                    },
                    {
                        id: "denied",
                        label: "Gesperrt",
                        resource: "properties",
                        permission: { action: "edit", denied: "disable" },
                    },
                    { id: "missing-view", label: "Fehlerhaft", resource: "properties", view: "missing" },
                ],
            },
        ];
        const tree = resolveNavigation(config, [properties], { id: 7, name: "Test", email: "x@y.de" }, decide);
        const entries = flattenNavigation(tree);

        expect(entries.map((item) => item.id)).toEqual(["restricted", "read-only", "denied"]);
        expect(entries.find((item) => item.id === "read-only")?.disabledReason).toBe("Nur lesender Zugriff");
        expect(entries.find((item) => item.id === "denied")?.disabledReason).toBe("Nur lesen");
        expect(resolveNavigation(config, [properties], { id: 3, name: "Test", email: "x@y.de" }, decide)
            .flatMap((item) => flattenNavigation(item.children).map((child) => child.id))).toEqual(["denied"]);
    });

    it("exposes the new standalone chart menu with an accurate breadcrumb", () => {
        const tree = resolveNavigation(defaultNavigation([properties]), [properties]);
        const charts = tree.find((item) => item.id === "charts");
        expect(charts).toMatchObject({
            to: "/charts",
            label: "Charts",
            badge: "Demo",
        });
        expect(navigationSelected(charts!, "/charts", "")).toBe(true);
        expect(navigationPath(tree, "/charts", "").map((item) => item.label))
            .toEqual(["Charts"]);
    });

    it("hides forbidden resources and empty groups in all navigation surfaces", () => {
        const tree = resolveNavigation(defaultNavigation([properties]), [properties], undefined,
            () => ({ allowed: false, reason: "Kein Zugriff" }));
        expect(tree.map((item) => item.id)).toEqual(["home", "charts", "import-wizard-demo", "reui-grid-demo"]);
    });

    it("does not expose a resource when list access is denied even if another action is allowed", () => {
        const tree = resolveNavigation([
            {
                id: "edit-only",
                label: "Bearbeiten",
                resource: "properties",
                permission: { action: "edit" },
            },
        ], [properties], undefined, (_resource, action) => action === "edit");
        expect(tree).toEqual([]);
    });

    it("allows groups to default closed and hide their contents through configured rules", () => {
        const closed = defaultNavigation([properties], {
            Stammdaten: { defaultOpen: false, description: "Einfach", tooltip: "Alles zum Bestand" },
        });
        expect(closed.find((node) => node.id === "group:Stammdaten")).toEqual(
            expect.objectContaining({
                defaultOpen: false,
                description: "Einfach",
                tooltip: "Alles zum Bestand",
            }),
        );
        const hidden = defaultNavigation([properties], {
            Stammdaten: { visible: () => false },
        });
        expect(resolveNavigation(hidden, [properties]).map((node) => node.id)).toEqual(["home", "charts", "import-wizard-demo", "reui-grid-demo"]);
    });

    it("does not turn a stale view link into unrestricted navigation", () => {
        const tree = resolveNavigation([
            { id: "bad", label: "Fehler", resource: "properties", view: "unknown" },
        ], [properties]);
        expect(tree).toEqual([]);
    });
});
