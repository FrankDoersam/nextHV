import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Building2 } from "lucide-react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ResourceDefinition } from "@/framework/types";
import { CollectionLoading } from "./collection-loading";

beforeEach(() => {
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

it("renders view tabs above the table skeleton during route loading", () => {
    const resource = {
        name: "properties",
        label: "Objekte",
        icon: Building2,
        views: [
            { id: "all", label: "Alle", count: true },
            { id: "active", label: "Aktiv", count: true },
            { id: "archived", label: "Inaktiv", count: true },
        ],
    } as ResourceDefinition;
    const { container } = render(
        <CollectionLoading resource={resource} activeView="archived" />,
    );

    const tabs = screen.getByRole("tablist", { name: "Objekte Ansichten" });
    const table = container.querySelector(
        '[data-slot="collection-loading-table"]',
    );
    expect(table).not.toBeNull();
    expect(tabs).toContainElement(screen.getByRole("tab", { name: "Inaktiv" }));
    expect(screen.getByRole("tab", { name: "Inaktiv" })).toHaveAttribute(
        "aria-selected",
        "true",
    );
    expect(tabs.compareDocumentPosition(table!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
});
