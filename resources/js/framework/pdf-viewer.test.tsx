import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PdfViewer from "@/components/blocks/pdf-viewer";
import { fetchPdf } from "./data/documents";
beforeEach(() => {
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
    URL.createObjectURL = vi.fn(() => "blob:pdf-preview");
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
describe("PDF reader", () => {
    it("embeds the protected document without a renderer dependency and releases its object URL", async () => {
        const view = render(
            <PdfViewer url="/api/v1/report.pdf" name="Objektbericht.pdf" />,
        );
        expect(
            await screen.findByLabelText("PDF-Seitenansicht"),
        ).toHaveAttribute("data", "blob:pdf-preview");
        expect(screen.getByRole("link", { name: /^PDF$/ })).toHaveAttribute(
            "download",
            "Objektbericht.pdf",
        );
        const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
        expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe(
            "same-origin",
        );
        view.unmount();
        expect(signal?.aborted).toBe(true);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf-preview");
    });
    it("shows a recoverable error instead of passing a non-PDF response to the renderer", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response("<html>Login</html>", {
                headers: { "Content-Type": "text/html" },
            }),
        );
        render(<PdfViewer url="/api/v1/report.pdf" />);
        expect(
            await screen.findByText("Die Antwort ist kein PDF-Dokument."),
        ).toBeVisible();
        expect(
            screen.queryByLabelText("PDF-Seitenansicht"),
        ).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole("button", { name: /erneut|wiederholen/i }),
        );
        await waitFor(() =>
            expect(screen.getByLabelText("PDF-Seitenansicht")).toBeVisible(),
        );
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
});
