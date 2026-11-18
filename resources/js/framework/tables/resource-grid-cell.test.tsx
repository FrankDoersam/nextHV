import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Building2 } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRentScenarioColumns } from "@/modules/contracts/rent-scenario-columns";
import { useResourceList } from "../data/hooks";
import { ApiError } from "../data/http";
import { dataProvider } from "../data/provider";
import { configurePermissions } from "../permissions";
import type {
    CellDraftValues,
    ColumnDefinition,
    RecordData,
    ResourceDefinition,
} from "../types";
import { CellRenderer } from "./cell-renderer";
import { ResourceGridCell } from "./resource-grid-cell";

const clients: QueryClient[] = [];
const record = (): RecordData => ({
    id: 8,
    updated_at: "2026-11-18T09:00:00Z",
    base_rent: 1200,
    reason: "Kondition 8",
});
const rentColumn: ColumnDefinition = {
    field: "base_rent",
    label: "Grundmiete",
    kind: "currency",
    input: { kind: "currency", mode: "record", min: 0, nullable: false },
};

function resource(columns: ColumnDefinition[]): ResourceDefinition {
    return {
        name: "rent-conditions",
        label: "Konditionen",
        singular: "Kondition",
        description: "",
        icon: Building2,
        titleField: "reason",
        actions: [],
        fields: [
            {
                name: "base_rent",
                label: "Grundmiete",
                kind: "currency",
                required: true,
            },
            { name: "reason", label: "Anlass" },
        ],
        columns,
    };
}

function DraftCells({
    definition,
    row,
}: {
    definition: ResourceDefinition;
    row: RecordData;
}) {
    const [draft, setDraft] = useState<CellDraftValues>({});
    return (
        <table>
            <tbody>
                <tr>
                    {definition.columns.map((column) => (
                        <td key={column.field} aria-label={column.label}>
                            <ResourceGridCell
                                resource={definition}
                                row={row}
                                column={column}
                                draft={draft}
                                onDraftChange={(field, value) =>
                                    setDraft((current) => ({
                                        ...current,
                                        [field]: value,
                                    }))
                                }
                            />
                        </td>
                    ))}
                </tr>
            </tbody>
        </table>
    );
}

function LiveCell({ definition }: { definition: ResourceDefinition }) {
    const result = useResourceList(definition);
    const row = result.data?.data[0];
    return row ? (
        <ResourceGridCell
            resource={definition}
            row={row}
            column={definition.columns[0]}
        />
    ) : (
        <p>Lädt</p>
    );
}

function mount(element: React.ReactNode) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    clients.push(client);
    return render(
        <QueryClientProvider client={client}>{element}</QueryClientProvider>,
    );
}

beforeEach(() => {
    configurePermissions({ enabled: false, adapter: { can: () => true } });
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: vi.fn(() => ({
            matches: false,
            addEventListener() {},
            removeEventListener() {},
        })),
    });
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.getAnimations = vi.fn(() => []);
});

afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    configurePermissions({ enabled: false, adapter: { can: () => true } });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("resource grid cells", () => {
    it("updates rent previews through percent, date, choice and boolean inputs without saving data", async () => {
        const row = Object.freeze(record());
        const save = vi.spyOn(dataProvider, "save");
        const validate = vi.spyOn(dataProvider, "validate");
        const user = userEvent.setup();
        mount(
            <DraftCells
                definition={resource(buildRentScenarioColumns(2027))}
                row={row}
            />,
        );
        const percent = screen.getByRole("textbox", {
            name: "Mietanpassung · % – Kondition 8",
        });
        const date = screen.getByRole("textbox", {
            name: "Anpassung ab – Kondition 8",
        });

        await user.clear(percent);
        await user.type(percent, "7,51");
        await user.tab();
        await user.clear(date);
        await user.type(date, "01072027");
        await user.tab();

        expect(
            screen.getByRole("cell", { name: "Grundmiete · Vorschau" }),
        ).toHaveTextContent("1.290,12");
        expect(
            screen.getByRole("cell", { name: "Mehrertrag · Vorschaujahr" }),
        ).toHaveTextContent("540,72");
        await user.click(
            screen.getByRole("combobox", { name: "Rundung – Kondition 8" }),
        );
        await user.click(
            await screen.findByRole("option", { name: "Volle Euro" }),
        );
        expect(
            screen.getByRole("cell", { name: "Grundmiete · Vorschau" }),
        ).toHaveTextContent("1.290,00");
        await user.click(
            screen.getByRole("checkbox", {
                name: "Anpassung aktiv – Kondition 8",
            }),
        );
        expect(
            screen.getByRole("cell", { name: "Mehrertrag · Vorschaujahr" }),
        ).toHaveTextContent("0,00");
        expect(row.base_rent).toBe(1200);
        expect(save).not.toHaveBeenCalled();
        expect(validate).not.toHaveBeenCalled();
    });

    it("validates an explicit record input and saves with the original optimistic-lock version", async () => {
        const original = record();
        const definition = resource([rentColumn]);
        const sequence: string[] = [];
        vi.spyOn(dataProvider, "list").mockResolvedValue({
            data: [original],
            total: 1,
            current_page: 1,
            last_page: 1,
        });
        const validate = vi
            .spyOn(dataProvider, "validate")
            .mockImplementation(async () => {
                sequence.push("validate");
            });
        const save = vi
            .spyOn(dataProvider, "save")
            .mockImplementation(async (_resource, values) => {
                sequence.push("save");
                return {
                    ...original,
                    ...values,
                    updated_at: "2026-11-18T10:00:00Z",
                };
            });
        const user = userEvent.setup();
        mount(<LiveCell definition={definition} />);
        const input = await screen.findByRole("textbox", {
            name: "Grundmiete – Kondition 8",
        });

        await user.clear(input);
        await user.type(input, "1300,50");
        await user.tab();
        expect(save).not.toHaveBeenCalled();
        await user.click(
            screen.getByRole("button", { name: "Grundmiete speichern" }),
        );

        await waitFor(() =>
            expect(save).toHaveBeenCalledExactlyOnceWith(
                definition,
                { base_rent: 1300.5, reason: "Kondition 8" },
                original,
            ),
        );
        expect(validate).toHaveBeenCalledExactlyOnceWith(
            definition,
            { base_rent: 1300.5, reason: "Kondition 8" },
            original,
            ["base_rent"],
        );
        expect(sequence).toEqual(["validate", "save"]);
        await waitFor(() => expect(input).toHaveValue("1.300,50"));
        expect(
            screen.queryByRole("button", { name: "Grundmiete speichern" }),
        ).not.toBeInTheDocument();
    });

    it("keeps rejected inline edits available for correction and never submits a failed validation", async () => {
        const original = record();
        const validate = vi
            .spyOn(dataProvider, "validate")
            .mockRejectedValue(
                new ApiError(422, "Mietanpassung ist nicht zulässig."),
            );
        const save = vi.spyOn(dataProvider, "save").mockResolvedValue({
            ...original,
            base_rent: 1500,
            updated_at: "2026-11-18T10:00:00Z",
        });
        const user = userEvent.setup();
        mount(
            <ResourceGridCell
                resource={resource([rentColumn])}
                row={original}
                column={rentColumn}
            />,
        );
        const input = screen.getByRole("textbox", {
            name: "Grundmiete – Kondition 8",
        });
        await user.clear(input);
        await user.type(input, "1500");
        await user.tab();
        await user.click(
            screen.getByRole("button", { name: "Grundmiete speichern" }),
        );

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Mietanpassung ist nicht zulässig.",
        );
        expect(input).toHaveValue("1.500,00");
        expect(save).not.toHaveBeenCalled();
        validate.mockResolvedValue(undefined);
        await user.click(
            screen.getByRole("button", { name: "Grundmiete speichern" }),
        );
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    });

    it("rechecks editing permission after asynchronous validation and keeps non-resource inputs as drafts", async () => {
        const original = record();
        let finishValidation!: () => void;
        vi.spyOn(dataProvider, "validate").mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finishValidation = resolve;
                }),
        );
        const save = vi.spyOn(dataProvider, "save");
        const user = userEvent.setup();
        const definition = resource([rentColumn]);
        mount(
            <ResourceGridCell
                resource={definition}
                row={original}
                column={rentColumn}
            />,
        );
        const input = screen.getByRole("textbox", {
            name: "Grundmiete – Kondition 8",
        });
        await user.clear(input);
        await user.type(input, "1300");
        await user.click(
            screen.getByRole("button", { name: "Grundmiete speichern" }),
        );

        await act(async () => {
            configurePermissions({
                enabled: true,
                adapter: { can: () => false },
            });
            finishValidation();
        });

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Berechtigung zum Bearbeiten",
        );
        expect(input).toBeDisabled();
        expect(save).not.toHaveBeenCalled();
        const draftColumn: ColumnDefinition = {
            field: "proposal",
            label: "Vorschlag",
            input: { kind: "number", mode: "record", initial: 2 },
        };
        mount(
            <DraftCells definition={resource([draftColumn])} row={original} />,
        );
        const preview = screen.getByRole("textbox", {
            name: "Vorschlag – Kondition 8",
        });
        expect(preview).toBeEnabled();
        await user.clear(preview);
        await user.type(preview, "9");
        await user.tab();
        expect(preview).toHaveValue("9");
        expect(
            screen.queryByRole("button", { name: "Vorschlag speichern" }),
        ).not.toBeInTheDocument();
        expect(save).not.toHaveBeenCalled();
    });

    it("renders budget progress, a numeric difference and an accessible trend from the same cell schema", () => {
        const row = {
            ...record(),
            spend: 75,
            target: 100,
            history: [10, 12, 9, 15],
            ratio: 4.3,
            zero: 0,
            missing: null,
        };
        const target = { type: "field" as const, field: "target" };
        render(
            <>
                <CellRenderer
                    row={row}
                    column={{
                        field: "spend",
                        label: "Budget",
                        kind: "currency",
                        cell: { type: "progress", target },
                    }}
                />
                <CellRenderer
                    row={row}
                    column={{
                        field: "spend",
                        label: "Kosten",
                        kind: "currency",
                        cell: {
                            type: "delta",
                            target,
                            deltaMode: "percent",
                            positive: "bad",
                        },
                    }}
                />
                <CellRenderer
                    row={row}
                    column={{
                        field: "history",
                        label: "Ertragstrend",
                        cell: { type: "sparkline" },
                    }}
                />
                <CellRenderer
                    row={{ ...row, share: 16.6 }}
                    column={{
                        field: "share",
                        label: "Anteil",
                        kind: "percent",
                        cell: {
                            type: "comparison",
                            target: { type: "literal", value: 14 },
                        },
                    }}
                />
                {["ratio", "zero", "missing"].map((field) => (
                    <CellRenderer
                        key={field}
                        row={row}
                        column={{
                            field,
                            label: field,
                            cell: { type: "ratio" },
                        }}
                    />
                ))}
            </>,
        );

        expect(
            screen.getByRole("progressbar", { name: "Budget" }),
        ).toHaveAttribute("aria-valuenow", "75");
        expect(
            screen.getByRole("progressbar", { name: "Budget" }),
        ).toHaveAttribute("aria-valuetext", expect.stringContaining("75 %"));
        expect(screen.getByText("-25 %")).toBeVisible();
        expect(screen.getByText("+2,6 pp")).toBeVisible();
        expect(
            screen.getByRole("img", { name: "Ertragstrend: 10 → 15" }),
        ).toBeInTheDocument();
        expect(screen.getByText("4,3×")).toBeVisible();
        expect(screen.getByText("0×")).toBeVisible();
        expect(screen.getByText("—")).toBeVisible();
        expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
    });
});
