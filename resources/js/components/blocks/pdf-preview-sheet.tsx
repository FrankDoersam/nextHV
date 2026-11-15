import { lazy, Suspense } from "react";
import { FileText } from "lucide-react";
import { Overlay } from "./overlay";
import { Loading } from "./content";
import type { Presentation } from "@/framework/types";
const PdfViewer = lazy(() => import("./pdf-viewer"));

/** Action result → shared surface → protected document loader. No report-specific page code. */
export function PdfPreviewSheet({
    url,
    name,
    title,
    onClose,
    presentation = "sheet",
}: {
    url: string;
    name: string;
    title: string;
    onClose: () => void;
    presentation?: Presentation;
}) {
    return (
        <Overlay
            open
            onClose={onClose}
            title={title}
            description={name}
            icon={<FileText />}
            presentation={presentation}
            size="wide"
            fill
            bodyInset={false}
            bodyScroll="managed"
        >
            <Suspense fallback={<Loading />}>
                <PdfViewer
                    url={url}
                    name={name}
                    title={title}
                    fill
                    showName={false}
                />
            </Suspense>
        </Overlay>
    );
}
