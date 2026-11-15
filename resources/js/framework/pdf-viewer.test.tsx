import React from "react";
import { Blob as NodeBlob } from "node:buffer";
import { TransformStream as NodeTransformStream } from "node:stream/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import PdfViewer from "@/components/blocks/pdf-viewer";
import { PdfPreviewSheet } from "@/components/blocks/pdf-preview-sheet";
import { ReportActionSheet } from "./report-action-sheet";
import { ReportAction } from "./actions";
import type { ActionContext } from "./types";
import { fetchPdf } from "./data/documents";

const engine = vi.hoisted(() => {
    const cancel = vi.fn();
    const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel }));
    const getPage = vi.fn(async (number: number) => ({
        getViewport: ({ scale }: { scale: number }) => ({
            width: (number === 1 ? 800 : 600) * scale,
            height: (number === 1 ? 400 : 900) * scale,
        }),
        render: renderPage,
    }));
    const destroy = vi.fn(async () => undefined);
    const getDocument = vi.fn(() => ({
        promise: Promise.resolve({ numPages: 2, getPage }),
        destroy,
    }));
    return { getDocument, getPage, renderPage, destroy, cancel };
});
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
    GlobalWorkerOptions: {},
    getDocument: engine.getDocument,
}));
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Blob", NodeBlob);
    vi.stubGlobal(
        "fetch",
        vi.fn(
            async () =>
                new Response("%PDF-1.7", {
                    headers: { "Content-Type": "application/pdf" },
                }),
        ),
    );
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
        {} as CanvasRenderingContext2D,
    );
    Element.prototype.getAnimations = vi.fn(() => []);
    Element.prototype.scrollTo = vi.fn();
    URL.createObjectURL = vi.fn(() => "blob:pdf-preview");
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
async function renderedFirstPage() {
    await waitFor(() =>
        expect(
            screen.queryByLabelText("PDF-Seite 1"),
            document.body.textContent || "",
        ).toHaveAttribute("data-rendered", "true"),
    );
}
const response = {
    data: {
        result: {
            data: {
                ui: {
                    type: "document",
                    url: "/api/v1/report.pdf",
                    name: "Objekt.pdf",
                    title: "Objektbericht",
                    mime: "application/pdf",
                },
            },
        },
    },
};

describe("PDF canvas reader", () => {
    it("fits actual mixed page sizes, zooms and frees the worker, canvas and download URL", async () => {
        const view = render(
            <PdfViewer url="/api/v1/report.pdf" name="Objektbericht.pdf" />,
        );
        await renderedFirstPage();
        expect(screen.getByLabelText("PDF-Seite 1")).toHaveStyle({
            width: "868px",
            height: "434px",
        });
        await waitFor(() => {
            const page = screen.getByLabelText("PDF-Seite 2");
            expect(parseFloat(page.style.width)).toBeCloseTo(868);
            expect(parseFloat(page.style.height)).toBeCloseTo(1302);
        });
        expect(document.querySelector("object, iframe")).toBeNull();
        expect(
            screen.getByRole("link", { name: "PDF herunterladen" }),
        ).toHaveAttribute("download", "Objektbericht.pdf");
        await userEvent.click(
            screen.getByRole("button", { name: "Vergrößern" }),
        );
        await waitFor(() =>
            expect(screen.getByLabelText("PDF-Seite 1")).toHaveStyle({
                width: "952px",
            }),
        );
        await userEvent.click(
            screen.getByRole("button", { name: "An Breite anpassen" }),
        );
        await renderedFirstPage();
        expect(screen.getByLabelText("PDF-Seite 1")).toHaveStyle({
            width: "868px",
        });
        const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
        expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe(
            "same-origin",
        );
        expect(vi.mocked(fetch).mock.calls[0][1]?.cache).toBe("no-store");
        view.unmount();
        expect(signal?.aborted).toBe(true);
        expect(engine.destroy).toHaveBeenCalledOnce();
        expect(engine.cancel).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf-preview");
    });
    it("recovers from a non-PDF response without mounting the renderer", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response("Login", { headers: { "Content-Type": "text/html" } }),
        );
        render(<PdfViewer url="/api/v1/report.pdf" />);
        expect(
            await screen.findByText("Die Antwort ist kein PDF-Dokument."),
        ).toBeVisible();
        expect(engine.getDocument).not.toHaveBeenCalled();
        await userEvent.click(
            screen.getByRole("button", { name: /erneut|wiederholen/i }),
        );
        await renderedFirstPage();
    });
    it("recovers from PDF engine errors inside the existing sheet", async () => {
        engine.getDocument.mockImplementationOnce(() => ({
            promise: Promise.reject(new Error("Corrupt file")),
            destroy: engine.destroy,
        }));
        render(
            <PdfPreviewSheet
                url="/api/v1/report.pdf"
                title="Bericht"
                onClose={vi.fn()}
            />,
        );
        expect(
            await screen.findByText(/Das PDF konnte nicht dargestellt werden/),
        ).toBeVisible();
        await userEvent.click(
            screen.getByRole("button", { name: /erneut|wiederholen/i }),
        );
        await renderedFirstPage();
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });
    it("tracks protected PDF byte progress without a second fetch or an extra JS byte buffer", async () => {
        vi.stubGlobal("TransformStream", NodeTransformStream);
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response("%PDF-1.7", {
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Length": "8",
                },
            }),
        );
        const updates: number[] = [];
        const blob = await fetchPdf(
            "/api/v1/report.pdf",
            new AbortController().signal,
            (percent) => updates.push(percent),
        );
        expect(blob.size).toBe(8);
        expect(updates[0]).toBe(0);
        expect(updates.at(-1)).toBe(100);
        expect(fetch).toHaveBeenCalledOnce();
    });

    it("refuses external sources before fetching", async () => {
        await expect(
            fetchPdf(
                "https://example.org/report.pdf",
                new AbortController().signal,
            ),
        ).rejects.toThrow("nicht freigegeben");
        expect(fetch).not.toHaveBeenCalled();
    });
    it("ignores a stale download after the source changes", async () => {
        let resolve!: (response: Response) => void;
        vi.mocked(fetch).mockReturnValueOnce(
            new Promise((done) => {
                resolve = done;
            }),
        );
        const view = render(<PdfViewer url="/api/v1/old.pdf" />);
        view.rerender(<PdfViewer url="/api/v1/new.pdf" />);
        await renderedFirstPage();
        resolve(
            new Response("%PDF-old", {
                headers: { "Content-Type": "application/pdf" },
            }),
        );
        await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
        expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    });
});

it("places document operations exclusively in the existing overlay actions slot", async () => {
    const { ActionResultOverlay, actionResult } =
        await import("./action-results");
    const result = actionResult(response)!;
    expect(() =>
        actionResult({
            data: {
                result: {
                    data: {
                        ui: {
                            ...response.data.result.data.ui,
                            presentation: "external",
                        },
                    },
                },
            },
        }),
    ).toThrow();
    const close = vi.fn();
    render(
        <ActionResultOverlay
            result={result as Exclude<typeof result, { type: "form-patch" }>}
            onClose={close}
        />,
    );
    await renderedFirstPage();
    // The lazy loading overlay is replaced by the completed report sheet.
    // Assert against the live dialog instead of a detached fallback node.
    const sheet = screen.getByRole("dialog", { name: "Objektbericht" });
    expect(sheet).toHaveAttribute("data-slot", "sheet-content");
    const actions = sheet.querySelector('[data-slot="overlay-actions"]')!;
    expect(actions).toContainElement(
        screen.getByRole("link", { name: "PDF herunterladen" }),
    );
    expect(actions).toContainElement(
        screen.getByRole("link", { name: "PDF öffnen" }),
    );
    expect(actions).toContainElement(
        screen.getByRole("button", { name: "Bericht aktualisieren" }),
    );
    expect(
        within(
            sheet.querySelector('[data-slot="overlay-body"]') as HTMLElement,
        ).queryByRole("link"),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(close).toHaveBeenCalledOnce();
});

const context: ActionContext = {
    resource: {
        name: "properties",
        label: "Objekte",
        singular: "Objekt",
        description: "",
        titleField: "name",
        icon: Building2,
        columns: [],
        fields: [],
        actions: [],
    },
    rows: [{ id: 1, name: "Lindenhöfe", updated_at: "2026-11-15T12:00:00Z" }],
    values: {},
    instance: {
        reload: vi.fn(),
        navigate: vi.fn(),
        openForm: vi.fn(),
        openFlow: vi.fn(),
        openRelation: vi.fn(),
    },
};
class ExampleReport extends ReportAction {
    id = "report";
    label = "Objektbericht";
    execute = vi.fn(async (_context: ActionContext, _signal?: AbortSignal) => response);
}
function mountReport(action: ExampleReport) {
    return render(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            <ReportActionSheet
                action={action}
                context={context}
                onClose={vi.fn()}
            />
        </QueryClientProvider>,
    );
}
it("opens reports directly, retries in-place and never reloads the underlying table", async () => {
    const action = new ExampleReport();
    action.execute.mockRejectedValueOnce(
        new Error("Bericht vorübergehend nicht verfügbar"),
    );
    mountReport(action);
    expect(screen.getByRole("dialog", { name: "Objektbericht" })).toBeVisible();
    expect(
        await screen.findByText("Bericht vorübergehend nicht verfügbar"),
    ).toBeVisible();
    await userEvent.click(
        screen.getByRole("button", { name: /erneut|wiederholen/i }),
    );
    await renderedFirstPage();
    expect(action.execute).toHaveBeenCalledTimes(2);
    expect(context.instance.reload).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
});
it("passes the live AbortSignal into report actions and aborts when the sheet closes", async () => {
    const action = new ExampleReport();
    action.execute.mockImplementationOnce(
        async () => new Promise<typeof response>(() => {}),
    );
    const view = mountReport(action);
    await waitFor(() => expect(action.execute).toHaveBeenCalledOnce());
    const signal = action.execute.mock.calls[0][1];
    expect(signal).toBeInstanceOf(AbortSignal);
    view.unmount();
    expect(signal?.aborted).toBe(true);
});

it("closing a pending report prevents a late response from starting a document download", async () => {
    const action = new ExampleReport();
    let resolve!: (value: typeof response) => void;
    action.execute.mockReturnValueOnce(
        new Promise((done) => {
            resolve = done;
        }),
    );
    const view = mountReport(action);
    await waitFor(() => expect(action.execute).toHaveBeenCalledOnce());
    view.unmount();
    resolve(response);
    await new Promise((done) => setTimeout(done, 0));
    expect(fetch).not.toHaveBeenCalled();
});

it("refetches a regenerated report with the same signed URL without reusing a revoked download", async () => {
    const close = vi.fn();
    vi.mocked(URL.createObjectURL)
        .mockReturnValueOnce("blob:first")
        .mockReturnValueOnce("blob:second");
    const view = render(
        <PdfPreviewSheet
            title="Bericht"
            url="/api/v1/report.pdf"
            onClose={close}
        />,
    );
    await renderedFirstPage();
    expect(
        screen.getByRole("link", { name: "PDF herunterladen" }),
    ).toHaveAttribute("href", "blob:first");
    view.rerender(
        <PdfPreviewSheet
            title="Bericht"
            url="/api/v1/report.pdf"
            loading
            onClose={close}
        />,
    );
    expect(
        screen.queryByRole("link", { name: "PDF herunterladen" }),
    ).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");
    view.rerender(
        <PdfPreviewSheet
            title="Bericht"
            url="/api/v1/report.pdf"
            onClose={close}
        />,
    );
    await waitFor(() =>
        expect(
            screen.getByRole("link", { name: "PDF herunterladen" }),
        ).toHaveAttribute("href", "blob:second"),
    );
    await renderedFirstPage();
    expect(fetch).toHaveBeenCalledTimes(2);
});
