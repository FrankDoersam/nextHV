import { lazy, Suspense, useEffect } from "react";
import { FileText, LoaderCircle } from "lucide-react";
import { Overlay } from "./overlay";
import { ErrorState, Loading } from "./content";
import { PdfDocumentActions } from "./pdf-document-actions";
import { usePdfDocument } from "@/framework/data/use-pdf-document";
import type { Presentation } from "@/framework/types";
const PdfCanvasPreview = lazy(() => import("./pdf-canvas-preview"));

/** s4v2 structure: shared sheet frame → protected loader → lazy PDF.js canvas. */
export function PdfPreviewSheet({
    url,
    name = "Bericht.pdf",
    title,
    onClose,
    presentation = "sheet",
    loading = false,
    error,
    onRetry,
}: {
    url?: string;
    name?: string;
    title: string;
    onClose: () => void;
    presentation?: Presentation;
    loading?: boolean;
    error?: unknown;
    onRetry?: () => void;
}) {
    // Warm PDF.js and the canvas chunk while the signed URL is prepared and
    // the download is in flight. Keep both out of the initial app bundle.
    useEffect(() => {
        void import("./pdf-canvas-preview").catch(() => undefined);
    }, []);
    const document = usePdfDocument(loading ? undefined : url);
    const pending = loading || document.loading;
    const failure = error ?? document.error;
    const retry = onRetry ?? document.reload;
    return (
        <Overlay
            open
            onClose={onClose}
            title={title}
            description={url ? name : undefined}
            icon={<FileText />}
            presentation={presentation}
            size="wide"
            fill
            bodyInset={false}
            bodyScroll="managed"
            actions={
                <PdfDocumentActions
                    url={pending || failure ? undefined : document.objectUrl}
                    name={name}
                    loading={pending}
                    onReload={retry}
                />
            }
        >
            {failure ? (
                <div className="m-auto w-full max-w-lg p-6">
                    <ErrorState error={failure} retry={retry} />
                </div>
            ) : pending || !document.blob ? (
                <div
                    role="status"
                    className="flex min-h-64 flex-1 items-center justify-center gap-2 bg-muted/30 text-sm text-muted-foreground"
                >
                    <LoaderCircle className="size-4 animate-spin" />
                    <span>
                        {loading
                            ? "Bericht wird vorbereitet …"
                            : document.progress !== undefined
                              ? `PDF wird geladen · ${document.progress} %`
                              : "Dokument wird übertragen …"}
                    </span>
                    {!loading && document.progress !== undefined && (
                        <progress
                            aria-label="PDF-Downloadfortschritt"
                            max={100}
                            value={document.progress}
                            className="h-1.5 w-24 accent-primary"
                        />
                    )}
                </div>
            ) : (
                <Suspense fallback={<Loading />}>
                    <PdfCanvasPreview
                        key={document.objectUrl}
                        blob={document.blob}
                    />
                </Suspense>
            )}
        </Overlay>
    );
}
