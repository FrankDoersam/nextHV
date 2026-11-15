import React from "react";
import "@testing-library/jest-dom/vitest";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { CsvImportDialog } from "@/components/blocks/csv-import-dialog";
import * as http from "./data/http";
import type { ResourceDefinition } from "./types";
const resource: ResourceDefinition = {
    name: "units",
    label: "Einheiten",
    singular: "Einheit",
    icon: Building2,
    description: "",
    titleField: "name",
    fields: [],
    columns: [],
    actions: [],
    features: { import: true },
};
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
function mount() {
    return render(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            <CsvImportDialog resource={resource} open onClose={vi.fn()} />
        </QueryClientProvider>,
    );
}
const inspection = {
    fields: [
        {
            name: "property_id",
            label: "Objekt",
            type: "integer",
            match: ["code", "name"],
        },
        { name: "name", label: "Bezeichnung", type: "text", match: [] },
    ],
    headers: ["Objekt", "Bezeichnung"],
    sample: [["P-01", "Wohnung"]],
    count: 1,
};
async function upload() {
    fireEvent.change(screen.getByLabelText("Datei"), {
        target: {
            files: [
                new File(["Objekt;Bezeichnung\nP-01;Wohnung"], "units.csv", {
                    type: "text/csv",
                }),
            ],
        },
    });
    fireEvent.click(screen.getByRole("button", { name: "Datei prüfen" }));
    await screen.findByRole("button", { name: "Vorschau prüfen" });
}
it("maps server fields, previews resolved relations and confirms only the server token", async () => {
    const call = vi
        .spyOn(http, "request")
        .mockResolvedValueOnce(inspection)
        .mockResolvedValueOnce({
            valid: true,
            token: "preview-token",
            rows: [
                {
                    row: 2,
                    values: { property_id: "Lindenhof (#1)", name: "Wohnung" },
                    errors: {},
                },
            ],
        })
        .mockResolvedValueOnce({ count: 1 });
    mount();
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Vorschau prüfen" }));
    expect(await screen.findByText("Lindenhof (#1)")).toBeVisible();
    const mapping = JSON.parse(
        (call.mock.calls[1][1] as FormData).get("mapping") as string,
    );
    expect(mapping).toEqual([
        { field: "property_id", column: 0, match: "code" },
        { field: "name", column: 1 },
    ]);
    fireEvent.click(
        screen.getByRole("button", { name: "1 Datensätze importieren" }),
    );
    await screen.findByText("1 Datensätze importiert");
    expect(call.mock.calls[2][1]).toEqual({ token: "preview-token" });
    expect(call).toHaveBeenCalledTimes(3);
});
it("shows row errors and prevents commit until the server validates a new preview", async () => {
    const call = vi
        .spyOn(http, "request")
        .mockResolvedValueOnce(inspection)
        .mockResolvedValueOnce({
            valid: false,
            token: null,
            rows: [
                {
                    row: 2,
                    values: { name: "Wohnung" },
                    errors: { property_id: ["Objekt: Mehrere Treffer."] },
                },
            ],
        });
    mount();
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Vorschau prüfen" }));
    expect(await screen.findByText("Objekt: Mehrere Treffer.")).toBeVisible();
    expect(
        screen.getByRole("button", { name: "1 Datensätze importieren" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Zuordnung ändern" }));
    await waitFor(() =>
        expect(
            screen.getByRole("button", { name: "Vorschau prüfen" }),
        ).toBeEnabled(),
    );
    expect(call).toHaveBeenCalledTimes(2);
});
