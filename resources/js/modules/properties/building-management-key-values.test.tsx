import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { dataProvider } from "@/framework/data/provider";
import { properties } from "./properties-resource";
import { BuildingManagementKeyValues } from "./building-management-key-values";

const initial = {
    id: 12,
    code: "OBJ-012",
    name: "Lindenhöfe",
    updated_at: "2026-11-16T09:00:00Z",
    management_type: "owned",
    type: "residential",
    construction_year: 1980,
    land_area: 800,
    heating_type: "Gas",
    energy_class: "C",
    management_started_on: "2026-01-01",
};

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

it("shows building and administration as seven editable key/value rows", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
        <QueryClientProvider client={client}>
            <BuildingManagementKeyValues property={initial} />
        </QueryClientProvider>,
    );
    expect(container.querySelector('[data-slot="property-building-management"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="key-value-list"] dt')).toHaveLength(7);
    expect(screen.getByText("Gas")).toBeVisible();
    expect(screen.getByText("800,00 m²")).toBeVisible();
    expect(screen.getByRole("button", { name: "Heizung bearbeiten" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Baujahr bearbeiten" })).toBeVisible();
});

it("edits and saves only the selected key with the original version", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const updated = {
        ...initial,
        heating_type: "Wärmepumpe",
        updated_at: "2026-11-16T09:30:00Z",
    };
    const save = vi.spyOn(dataProvider, "save").mockResolvedValue(updated);
    const user = userEvent.setup();
    render(
        <QueryClientProvider client={client}>
            <BuildingManagementKeyValues property={initial} />
        </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Heizung bearbeiten" }));
    const input = await screen.findByRole("textbox", { name: /Heizung/ });
    await user.clear(input);
    await user.type(input, "Wärmepumpe");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(
        properties,
        { heating_type: "Wärmepumpe" },
        initial,
    ));
    expect(await screen.findByText("Wärmepumpe")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /Heizung/ })).not.toBeInTheDocument();
});
