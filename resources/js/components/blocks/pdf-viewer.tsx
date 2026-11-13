import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
    ChevronLeft,
    ChevronRight,
    Download,
    Maximize,
    RotateCw,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, Loading } from "./content";
import { fetchPdf } from "@/framework/data/documents";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
).toString();
const options = {
    cMapUrl: `${import.meta.env.BASE_URL}pdf/cmaps/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdf/wasm/`,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdf/standard_fonts/`,
};

/** One rendered page bounds memory; PDF.js handles text, links and worker rendering. */
export default function PdfViewer({
    url,
    name = "Dokument.pdf",
    title = "PDF-Dokument",
}: {
    url: string;
    name?: string;
    title?: string;
}) {
    const [source, setSource] = useState<{
        requested: string;
        blobUrl: string;
    }>();
    const [error, setError] = useState<unknown>();
    const [attempt, setAttempt] = useState(0);
    const [pages, setPages] = useState(0);
    const [page, setPage] = useState(1);
    const [pageInput, setPageInput] = useState("1");
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [baseRotation, setBaseRotation] = useState(0);
    const [width, setWidth] = useState(640);
    const viewport = useRef<HTMLDivElement>(null);
    const active = source?.requested === url ? source.blobUrl : undefined;
    useEffect(() => {
        const controller = new AbortController();
        let objectUrl: string | undefined;
        setError(undefined);
        setSource(undefined);
        setPages(0);
        setPage(1);
        setZoom(1);
        setRotation(0);
        fetchPdf(url, controller.signal)
            .then((blob) => {
                if (controller.signal.aborted) return;
                objectUrl = URL.createObjectURL(blob);
                setSource({ requested: url, blobUrl: objectUrl });
            })
            .catch((e) => {
                if (!controller.signal.aborted) setError(e);
            });
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url, attempt]);
    useEffect(() => {
        if (!viewport.current) return;
        const observer = new ResizeObserver((entries) =>
            setWidth(Math.max(200, entries[0].contentRect.width - 48)),
        );
        observer.observe(viewport.current);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        setPageInput(String(page));
        viewport.current?.scrollTo?.({ top: 0 });
    }, [page]);
    const go = (value: number) => {
        if (Number.isFinite(value))
            setPage(Math.max(1, Math.min(pages || 1, Math.trunc(value))));
    };
    const changeZoom = (delta: number) =>
        setZoom((z) =>
            Math.max(0.25, Math.min(2.5, Math.round((z + delta) * 100) / 100)),
        );
    return (
        <section
            aria-label={title}
            className="overflow-hidden rounded-xl border bg-muted/50"
        >
            <div
                role="toolbar"
                aria-label="PDF-Werkzeuge"
                className="flex flex-wrap items-center justify-between gap-2 border-b bg-card p-2"
            >
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Vorherige PDF-Seite"
                        disabled={page <= 1 || !pages}
                        onClick={() => go(page - 1)}
                    >
                        <ChevronLeft />
                    </Button>
                    <Input
                        aria-label="PDF-Seite"
                        inputMode="numeric"
                        className="h-8 w-12 text-center"
                        value={pageInput}
                        disabled={!pages}
                        onChange={(e) => setPageInput(e.target.value)}
                        onBlur={() => {
                            go(Number(pageInput));
                            setPageInput(
                                String(
                                    Math.max(
                                        1,
                                        Math.min(
                                            pages || 1,
                                            Math.trunc(Number(pageInput)) || 1,
                                        ),
                                    ),
                                ),
                            );
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
                    />
                    <span className="text-xs text-muted-foreground">
                        / {pages || "—"}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Nächste PDF-Seite"
                        disabled={page >= pages}
                        onClick={() => go(page + 1)}
                    >
                        <ChevronRight />
                    </Button>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Verkleinern"
                        disabled={zoom <= 0.25}
                        onClick={() => changeZoom(-0.25)}
                    >
                        <ZoomOut />
                    </Button>
                    <span
                        aria-live="polite"
                        className="w-12 text-center text-xs tabular-nums"
                    >
                        {Math.round(zoom * 100)} %
                    </span>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Vergrößern"
                        disabled={zoom >= 2.5}
                        onClick={() => changeZoom(0.25)}
                    >
                        <ZoomIn />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="An Breite anpassen"
                        onClick={() => setZoom(1)}
                    >
                        <Maximize />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="PDF-Seite drehen"
                        onClick={() => setRotation((r) => (r + 90) % 360)}
                    >
                        <RotateCw />
                    </Button>
                    {active && (
                        <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            role="link"
                            render={<a href={active} download={name} />}
                        >
                            <Download /> PDF
                        </Button>
                    )}
                </div>
            </div>
            <div
                ref={viewport}
                tabIndex={0}
                aria-label="PDF-Seitenansicht"
                className="h-[62dvh] min-h-64 overflow-auto bg-stone-100 p-6 outline-offset-[-2px]"
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "ArrowRight") {
                        e.preventDefault();
                        go(page + 1);
                    }
                    if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        go(page - 1);
                    }
                    if (e.key === "+") changeZoom(0.25);
                    if (e.key === "-") changeZoom(-0.25);
                }}
            >
                {error ? (
                    <ErrorState
                        error={error}
                        retry={() => setAttempt((a) => a + 1)}
                    />
                ) : active ? (
                    <Document
                        file={active}
                        options={options}
                        suspense={false}
                        loading={<Loading />}
                        onLoadSuccess={(pdf) => setPages(pdf.numPages)}
                        onLoadError={setError}
                        onPassword={() =>
                            setError(
                                new Error(
                                    "Dieses PDF ist passwortgeschützt. Lade es herunter und öffne es mit dem Dokumentpasswort.",
                                ),
                            )
                        }
                        onItemClick={({ pageNumber }) => {
                            if (pageNumber) go(pageNumber);
                        }}
                        externalLinkTarget="_blank"
                        externalLinkRel="noopener noreferrer"
                        className="mx-auto w-fit"
                    >
                        <Page
                            pageNumber={page}
                            width={width}
                            scale={zoom}
                            rotate={
                                rotation ? baseRotation + rotation : undefined
                            }
                            onLoadSuccess={(page) =>
                                setBaseRotation(page.rotate)
                            }
                            suspense={false}
                            devicePixelRatio={Math.min(
                                window.devicePixelRatio || 1,
                                2,
                            )}
                            loading={<Loading />}
                            onRenderError={setError}
                            className="overflow-hidden bg-white shadow-md"
                        />
                    </Document>
                ) : (
                    <Loading />
                )}
            </div>
            <footer className="flex justify-between gap-3 border-t bg-card px-3 py-2 text-[11px] text-muted-foreground">
                <span className="truncate">{name}</span>
                <span className="shrink-0">
                    Text auswählbar · Zoom relativ zur Seitenbreite
                </span>
            </footer>
        </section>
    );
}
