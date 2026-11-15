import { lazy, Suspense, useEffect } from "react";
import { FileText, LoaderCircle } from "lucide-react";
import { Overlay } from "./overlay";
import { ErrorState } from "./content";
import { Skeleton } from "@/components/ui/skeleton";
import { PdfDocumentActions } from "./pdf-document-actions";
import { usePdfDocument } from "@/framework/data/use-pdf-document";
import type { Presentation } from "@/framework/types";
const PdfCanvasPreview = lazy(() => import("./pdf-canvas-preview"));

/**
 * A stable PDF-shaped loading surface inside the final sheet.
 * The report action, protected download and lazy PDF.js renderer each advance
 * independently; neither phase replaces the overlay or flashes a second dialog.
 */
function PdfPreviewSkeleton({
    stage,
    progress,
}: {
    stage: "preparing" | "downloading" | "rendering";
    progress?: number;
}) {
    const message =
        stage === "preparing"
            ? "Bericht wird vorbereitet …"
            : stage === "rendering"
              ? "PDF-Ansicht wird aufgebaut …"
              : progress !== undefined
                ? `PDF wird geladen · ${progress} %`
                : "Dokument wird übertragen …";

    return (
        <div
            data-slot="pdf-preview-loading"
            role="status"
            aria-label="PDF wird geladen"
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/40"
        >
            <div className="flex shrink-0 items-center justify-between border-b bg-card px-3 py-2 sm:px-5">
                <div className="flex items-center gap-2" aria-hidden="true">
                    <Skeleton className="size-9 rounded-md" />
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="size-9 rounded-md" />
                </div>
                <div className="flex items-center gap-2" aria-hidden="true">
                    <Skeleton className="h-4 w-11" />
                    <Skeleton className="size-9 rounded-md" />
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
                <div className="flex flex-col items-center gap-3 p-4">
                    <div className="flex flex-col items-center gap-2 rounded-lg bg-card px-5 py-3 text-sm text-muted-foreground shadow-sm">
                        <span className="flex items-center gap-2">
                            <LoaderCircle className="size-4 animate-spin" aria-hidden />
                            {message}
                        </span>
                        {stage === "downloading" && progress !== undefined && (
                            <progress
                                aria-label="PDF-Downloadfortschritt"
                                max={100}
                                value={progress}
                                className="h-1.5 w-36 accent-primary"
                            />
                        )}
                    </div>
                    <div
                        aria-hidden="true"
                        className="aspect-[210/297] w-full max-w-[40rem] shrink-0 rounded-sm border border-black/10 bg-white p-[7%] shadow-sm"
                    >
                        <div className="flex items-center justify-between gap-6">
                            <Skeleton className="h-3 w-32 max-w-1/2" />
                            <Skeleton className="h-3 w-20 max-w-1/3" />
                        </div>
                        <Skeleton className="mt-5 h-px w-full" />
                        <Skeleton className="mt-7 h-7 w-2/3" />
                        <Skeleton className="mt-3 h-3 w-4/5" />
                        <Skeleton className="mt-2 h-3 w-1/2" />
                        <Skeleton className="mt-10 h-5 w-1/2" />
                        <Skeleton className="mt-4 h-6 w-full" />
                        <div className="space-y-3 pt-4">
                            {Array.from({ length: 7 }, (_, index) => (
                                <Skeleton key={index} className="h-3 w-full" />
                            ))}
                        </div>
                    </div>
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
                <PdfPreviewSkeleton
                    stage={loading ? "preparing" : "downloading"}
                    progress={document.progress}
                />
            ) : (
                <Suspense fallback={<PdfPreviewSkeleton stage="rendering" />}>
                    <PdfCanvasPreview
                        key={document.objectUrl}
                        blob={document.blob}
                    />
                </Suspense>
            )}
        </Overlay>
    );
}
