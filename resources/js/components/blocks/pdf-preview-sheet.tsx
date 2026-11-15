import { lazy, Suspense } from "react";
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
                    Bericht wird vorbereitet …
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
