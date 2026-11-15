import { lazy, Suspense, useEffect } from "react";
import { FileText, LoaderCircle } from "lucide-react";
import { Overlay } from "./overlay";
import { ErrorState } from "./content";
import { PdfDocumentActions } from "./pdf-document-actions";
import { usePdfDocument } from "@/framework/data/use-pdf-document";
import type { Presentation } from "@/framework/types";
const PdfCanvasPreview = lazy(() => import("./pdf-canvas-preview"));

/**
 * A PDF report is a multi-step operation, not a page whose missing content
 * can be approximated by skeleton rows. Show the real stage and only report a
 * percentage when the browser knows the document's transfer size.
 */
function PdfLoadState({
    stage,
    progress,
}: {
    stage: "preparing" | "downloading" | "rendering";
    progress?: number;
}) {
    const copy = {
        preparing: {
            title: "Bericht wird erstellt",
            detail: "Das Dokument wird aus den aktuellen Daten erzeugt.",
        },
        downloading: {
            title: "PDF wird übertragen",
            detail: "Die Datei wird sicher geladen.",
        },
        rendering: {
            title: "Vorschau wird geöffnet",
            detail: "Der PDF-Viewer wird für die Anzeige vorbereitet.",
        },
    }[stage];
    const hasProgress =
        stage === "downloading" &&
        progress !== undefined &&
        Number.isFinite(progress) &&
        progress >= 0 &&
        progress <= 100;

    return (
        <div
            data-slot="pdf-preview-loading"
            aria-busy="true"
            className="flex min-h-0 flex-1 items-center justify-center bg-muted/40 px-6 py-12"
        >
            <div className="flex w-full max-w-sm flex-col items-center text-center">
                <div
                    aria-hidden="true"
                    className="flex size-14 items-center justify-center rounded-2xl border bg-card text-muted-foreground shadow-xs"
                >
                    <FileText className="size-6" />
                </div>
                <div
                    role="status"
                    aria-label="PDF wird geladen"
                    aria-live="polite"
                    aria-atomic="true"
                    className="mt-5"
                >
                    <p className="text-sm font-semibold text-foreground">
                        {copy.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {copy.detail}
                    </p>
                </div>
                <div className="mt-5 flex min-h-8 w-full max-w-56 items-center justify-center">
                    {hasProgress ? (
                        <div className="w-full">
                            <progress
                                aria-label="PDF-Übertragung"
                                max={100}
                                value={progress}
                                className="h-1.5 w-full overflow-hidden rounded-full accent-primary"
                            />
                            <p
                                aria-hidden="true"
                                className="mt-1.5 text-xs tabular-nums text-muted-foreground"
                            >
                                {Math.round(progress!)} %
                            </p>
                        </div>
                    ) : (
                        <LoaderCircle
                            aria-hidden="true"
                            className="size-5 text-primary motion-safe:animate-spin"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

/** Sheet stays mounted from the first click until a rendered document or error. */
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
                <PdfLoadState
                    stage={loading ? "preparing" : "downloading"}
                    progress={document.progress}
                />
            ) : (
                <Suspense fallback={<PdfLoadState stage="rendering" />}>
                    <PdfCanvasPreview
                        key={document.objectUrl}
                        blob={document.blob}
                    />
                </Suspense>
            )}
        </Overlay>
    );
}
