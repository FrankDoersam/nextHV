import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { AuditTimeline } from "@/components/blocks/audit-timeline";
import * as http from "./data/http";
import type { ResourceDefinition } from "./types";
const resource: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    icon: Building2,
    description: "",
    titleField: "name",
    fields: [],
    columns: [],
    actions: [],
    features: { audit: true },
};
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
function mount(enabled = true) {
    return render(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            <AuditTimeline
                resource={{ ...resource, features: { audit: enabled } }}
                id={8}
            />
        </QueryClientProvider>,
    );
}
it("renders server history and loads older entries only when requested", async () => {
    const request = vi
        .spyOn(http, "request")
        .mockResolvedValueOnce({
            data: [
                {
                    id: 20,
                    event: "updated",
                    actor: "Anna",
                    created_at: "2026-11-15T10:00:00Z",
                    changes: [{ label: "Name", before: "Alt", after: "Neu" }],
                },
            ],
            next_cursor: 20,
        })
        .mockResolvedValueOnce({
            data: [
                {
                    id: 19,
                    event: "created",
                    actor: "System",
                    created_at: "2026-11-14T10:00:00Z",
                    changes: [],
                },
            ],
            next_cursor: null,
        });
    mount();
    expect(await screen.findByText("Geändert · Anna")).toBeVisible();
    expect(screen.getByText("Alt")).toBeVisible();
    expect(screen.getByText("Neu")).toBeVisible();
    fireEvent.click(
        screen.getByRole("button", { name: "Weitere Änderungen laden" }),
    );
    expect(await screen.findByText("Angelegt · System")).toBeVisible();
    expect(request.mock.lastCall?.[0]).toBe(
        "/api/v1/resource-features/properties/8/audit?before=20",
    );
});
it("does not request history for resources without opt-in", () => {
    const request = vi.spyOn(http, "request");
    mount(false);
    expect(request).not.toHaveBeenCalled();
});
