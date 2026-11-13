import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PdfViewer from "@/components/blocks/pdf-viewer";
import { fetchPdf } from "./data/documents";
vi.mock("react-pdf", async () => {
    const React = await import("react");
    return {
        pdfjs: { GlobalWorkerOptions: {} },
        Document: ({
            children,
            file,
            onLoadSuccess,
        }: {
            children: React.ReactNode;
            file: string;
            onLoadSuccess: (pdf: { numPages: number }) => void;
        }) => {
            React.useEffect(() => {
                onLoadSuccess({ numPages: 3 });
            }, [file]);
            return <div>{children}</div>;
        },
        Page: ({
            pageNumber,
            scale,
            rotate,
        }: {
            pageNumber: number;
            scale: number;
            rotate: number;
        }) => (
            <div
                data-testid="page"
                data-page={pageNumber}
                data-scale={scale}
                data-rotation={rotate}
            >
                PDF-Seite {pageNumber}
            </div>
        ),
    };
});
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
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
    it("navigates pages, zooms, resets width, rotates and releases its protected document", async () => {
        const user = userEvent.setup();
        const view = render(
            <PdfViewer url="/api/v1/report.pdf" name="Objektbericht.pdf" />,
        );
        expect(await screen.findByTestId("page")).toHaveAttribute(
            "data-page",
            "1",
        );
        await user.click(
            screen.getByRole("button", { name: "Nächste PDF-Seite" }),
        );
        expect(screen.getByTestId("page")).toHaveAttribute("data-page", "2");
        await user.click(screen.getByRole("button", { name: "Vergrößern" }));
        expect(screen.getByTestId("page")).toHaveAttribute(
            "data-scale",
            "1.25",
        );
        await user.click(
            screen.getByRole("button", { name: "An Breite anpassen" }),
        );
        expect(screen.getByTestId("page")).toHaveAttribute("data-scale", "1");
        await user.click(
            screen.getByRole("button", { name: "PDF-Seite drehen" }),
        );
        expect(screen.getByTestId("page")).toHaveAttribute(
            "data-rotation",
            "90",
        );
        expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute(
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
        expect(screen.queryByTestId("page")).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole("button", { name: /erneut|wiederholen/i }),
        );
        await waitFor(() => expect(screen.getByTestId("page")).toBeVisible());
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
