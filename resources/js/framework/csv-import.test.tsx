import React from "react";
import userEvent from "@testing-library/user-event";
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
const baseField = {
    nullable: false,
    required: false,
    aliases: [],
    options: [],
    match: [],
    matchOptions: [],
    relation: null,
};
const inspection = {
    fields: [
        {
            ...baseField,
            name: "property_id",
            label: "Objekt",
            type: "integer",
            match: ["code", "name"],
            matchOptions: [
                { value: "code", label: "Nummer" },
                { value: "name", label: "Bezeichnung" },
            ],
            relation: { name: "property", label: "Objekte" },
        },
        {
            ...baseField,
            name: "name",
            label: "Bezeichnung",
            type: "text",
            required: true,
        },
    ],
    headers: ["Objekt", "Bezeichnung"],
    sample: [["P-01", "Wohnung"]],
    count: 1,
    mapping: [
        { field: "property_id", column: 0, match: "code" },
        { field: "name", column: 1 },
    ],
    values: [["P-01"], ["Wohnung"]],
};
const schema = {
    fields: inspection.fields,
    template: "Objekt;Bezeichnung\n",
    limits: { rows: 100, bytes: 2097152 },
};
async function upload() {
    fireEvent.change(await screen.findByLabelText("Datei"), {
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
        .mockResolvedValueOnce(schema)
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
        (call.mock.calls[2][1] as FormData).get("mapping") as string,
    );
    expect(mapping).toEqual([
        { field: "property_id", column: 0, match: "code" },
        { field: "name", column: 1 },
    ]);
    fireEvent.click(
        screen.getByRole("button", { name: "1 Datensatz importieren" }),
    );
    await screen.findByText("1 Datensatz importiert");
    expect(call.mock.calls[3][1]).toEqual({ token: "preview-token" });
    expect(call).toHaveBeenCalledTimes(4);
});
it("shows row errors and prevents commit until the server validates a new preview", async () => {
    const call = vi
        .spyOn(http, "request")
        .mockResolvedValueOnce(schema)
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
        screen.getByRole("button", { name: "1 Datensatz importieren" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Zuordnung ändern" }));
    await waitFor(() =>
        expect(
            screen.getByRole("button", { name: "Vorschau prüfen" }),
        ).toBeEnabled(),
    );
    expect(call).toHaveBeenCalledTimes(3);
});

it("maps unknown enum captions using server choices and sends explicit value mappings", async () => {
    const enumField = {
        ...baseField,
        name: "type",
        label: "Art",
        type: "enum",
        options: [
            { value: "apartment", label: "Wohnung" },
            { value: "garage", label: "Garage" },
        ],
    };
    const call = vi
        .spyOn(http, "request")
        .mockResolvedValueOnce({
            ...schema,
            fields: [...schema.fields, enumField],
        })
        .mockResolvedValueOnce({
            ...inspection,
            fields: [...inspection.fields, enumField],
            headers: [...inspection.headers, "Art"],
            sample: [["P-01", "Wohnung", "Whg"]],
            values: [...inspection.values, ["Whg"]],
            mapping: [...inspection.mapping, { field: "type", column: 2 }],
        })
        .mockResolvedValueOnce({
            valid: false,
            token: null,
            rows: [
                {
                    row: 2,
                    values: { type: "Wohnung" },
                    errors: { name: ["Bezeichnung fehlt."] },
                },
            ],
        });
    const user = userEvent.setup();
    mount();
    await upload();
    await user.click(
        screen.getByRole("combobox", { name: "Art: Whg zuordnen" }),
    );
    await user.click(await screen.findByRole("option", { name: "Wohnung" }));
    await user.click(screen.getByRole("button", { name: "Vorschau prüfen" }));
    await screen.findByText("Bezeichnung fehlt.");
    const mapping = JSON.parse(
        (call.mock.calls[2][1] as FormData).get("mapping") as string,
    );
    expect(mapping[2]).toEqual({
        field: "type",
        column: 2,
        values: [{ from: "Whg", to: "apartment" }],
    });
    expect(
        screen.getByRole("button", { name: "1 Datensatz importieren" }),
    ).toBeDisabled();
});

it("blocks file processing on denied schema and offers a retry", async () => {
    const call = vi
        .spyOn(http, "request")
        .mockRejectedValue(new http.ApiError(403, "Import nicht erlaubt."));
    mount();
    expect(await screen.findByText("Import nicht erlaubt.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Datei prüfen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Vorlage" })).toBeDisabled();
    expect(call).toHaveBeenCalledTimes(1);
});
