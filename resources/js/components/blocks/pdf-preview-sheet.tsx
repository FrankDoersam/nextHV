import { lazy, Suspense, useEffect } from "react";
import { FileText } from "lucide-react";
import { Progress } from "@base-ui/react/progress";
import { Spinner } from "@/components/ui/spinner";
import { Overlay } from "./overlay";
import { ErrorState } from "./content";
import { PdfDocumentActions } from "./pdf-document-actions";
import { usePdfDocument } from "@/framework/data/use-pdf-document";
import type { Presentation } from "@/framework/types";
const PdfCanvasPreview = lazy(() => import("./pdf-canvas-preview"));

/**
 * REUI Base-Mira composition:
 * c-spinner-9 (inline spinner + status copy) for indeterminate work and
 * Base UI Progress (label/value/track/indicator) for measured transfers.
 * Unlike a skeleton, this does not pretend the document contents exist yet.
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
            className="flex min-h-0 flex-1 items-center justify-center bg-card p-6"
        >
            <div className="w-full max-w-72">
                <div
                    role="status"
                    aria-label="PDF wird geladen"
                    aria-live="polite"
                    aria-atomic="true"
                    className="flex items-start gap-3"
                >
                    {hasProgress ? (
                        <span aria-hidden="true" className="size-4 shrink-0" />
                    ) : (
                        <Spinner
                            role="presentation"
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-primary motion-reduce:animate-none"
                        />
                    )}
                    <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium text-foreground">
                            {copy.title}
                        </p>
                        <p className="text-xs leading-5 text-muted-foreground">
                            {copy.detail}
                        </p>
                    </div>
                </div>
                {hasProgress && (
                    <Progress.Root
                        value={Math.round(progress)}
                        locale="de-DE"
                        className="mt-4 grid w-full grid-cols-[1fr_auto] gap-y-2"
                    >
                        <Progress.Label className="text-xs text-muted-foreground">
                            PDF-Übertragung
                        </Progress.Label>
                        <Progress.Value className="text-right text-xs tabular-nums text-muted-foreground" />
                        <Progress.Track className="col-span-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                            <Progress.Indicator className="block h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-150" />
                        </Progress.Track>
                    </Progress.Root>
                )}
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
