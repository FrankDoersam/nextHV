import { lazy, Suspense, useEffect } from "react";
import { usePdfDocument } from "@/framework/data/use-pdf-document";
import { ErrorState, Loading } from "./content";
import { PdfDocumentActions } from "./pdf-document-actions";
import { cn } from "@/lib/utils";
const PdfCanvasPreview = lazy(() => import("./pdf-canvas-preview"));

/** Embedded document use; report sheets reuse the loader and put actions in their header. */
export default function PdfViewer({
    url,
    name = "Dokument.pdf",
    title = "PDF-Dokument",
    fill = false,
    showName = true,
}: {
    url: string;
    name?: string;
    title?: string;
    fill?: boolean;
    showName?: boolean;
}) {
    useEffect(() => {
        void import("./pdf-canvas-preview").catch(() => undefined);
        void import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => undefined);
    }, []);
    const document = usePdfDocument(url);
    return (
        <section
            aria-label={title}
            className={cn(
                "flex min-h-0 flex-col overflow-hidden bg-muted/40",
                fill ? "flex-1" : "h-[70dvh] min-h-80 rounded-xl border",
            )}
        >
            <div className="flex shrink-0 items-center justify-end gap-1 border-b bg-card p-3">
                {showName && (
                    <span className="mr-auto min-w-0 truncate text-sm font-medium">
                        {name}
                    </span>
                )}
                <PdfDocumentActions
                    url={document.objectUrl}
                    name={name}
                    loading={document.loading}
                    onReload={document.reload}
                />
            </div>
            {document.error ? (
                <ErrorState error={document.error} retry={document.reload} />
            ) : document.blob ? (
                <Suspense fallback={<Loading />}>
                    <PdfCanvasPreview blob={document.blob} />
                </Suspense>
            ) : (
                <Loading />
            )}
        </section>
    );
}
