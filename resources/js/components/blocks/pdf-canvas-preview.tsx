import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject,
} from "react";
import type {
    PDFDocumentLoadingTask,
    PDFDocumentProxy,
    RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import {
    ChevronLeft,
    ChevronRight,
    LoaderCircle,
    Maximize,
    Minus,
    Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "./content";

type PageSize = { width: number; height: number };
const clamp = (value: number) => Math.min(220, Math.max(25, Math.round(value)));

/** Adapted from s4v2: render only pages near the viewport and cancel obsolete canvas work. */
function PdfPage({
    pdf,
    number,
    zoom,
    fit,
    width,
    fallback,
    viewport,
}: {
    pdf: PDFDocumentProxy;
    number: number;
    zoom: number;
    fit: boolean;
    width: number;
    fallback: PageSize;
    viewport: RefObject<HTMLDivElement | null>;
}) {
    const host = useRef<HTMLElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [near, setNear] = useState(number === 1);
    const [size, setSize] = useState(fallback);
    const [rendered, setRendered] = useState(false);
    const [error, setError] = useState<unknown>();
    const [attempt, setAttempt] = useState(0);
    const scale = fit ? Math.max(0.1, (width - 32) / size.width) : zoom / 100;
    useEffect(() => {
        if (!host.current || typeof IntersectionObserver === "undefined") {
            setNear(true);
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => setNear(entry.isIntersecting),
            { root: viewport.current, rootMargin: "600px 0px" },
        );
        observer.observe(host.current);
        return () => observer.disconnect();
    }, [viewport]);
    useEffect(() => {
        if (!near || !canvas.current || width === 0) return;
        const node = canvas.current;
        let cancelled = false;
        let task: RenderTask | undefined;
        setRendered(false);
        setError(undefined);
        void (async () => {
            try {
                const page = await pdf.getPage(number);
                if (cancelled) return;
                const natural = page.getViewport({ scale: 1 });
                if (
                    natural.width !== size.width ||
                    natural.height !== size.height
                ) {
                    setSize({ width: natural.width, height: natural.height });
                    return;
                }
                const css = page.getViewport({ scale });
                // Bound each visible canvas to 8M pixels, even at high zoom / retina.
                const ratio = Math.min(
                    window.devicePixelRatio || 1,
                    2,
                    Math.sqrt(8_000_000 / (css.width * css.height)),
                );
                const pixels = page.getViewport({ scale: scale * ratio });
                node.width = Math.ceil(pixels.width);
                node.height = Math.ceil(pixels.height);
                const context = node.getContext("2d", { alpha: false });
                if (!context)
                    throw new Error(
                        "Die PDF-Ansicht konnte nicht gestartet werden.",
                    );
                task = page.render({
                    canvas: node,
                    canvasContext: context,
                    viewport: pixels,
                    background: "white",
                });
                await task.promise;
                if (!cancelled) setRendered(true);
            } catch (failure) {
                if (!cancelled)
                    setError(
                        failure instanceof Error &&
                            failure.name === "RenderingCancelledException"
                            ? undefined
                            : new Error(
                                  `Seite ${number} konnte nicht dargestellt werden.`,
                              ),
                    );
            }
        })();
        return () => {
            cancelled = true;
            task?.cancel();
            // This node is keyed by scale and never reused by a concurrent render task.
            node.width = 0;
            node.height = 0;
        };
    }, [near, pdf, number, scale, size.width, size.height, width, attempt]);
    return (
        <article
            ref={host}
            data-page={number}
            aria-label={`PDF-Seite ${number}`}
            data-rendered={near && rendered ? "true" : "false"}
            className="relative shrink-0 overflow-hidden rounded-sm border border-black/10 bg-white shadow-sm"
            style={{
                width: size.width * scale,
                height: size.height * scale,
                contain: "layout paint",
            }}
        >
            {near && (
                <canvas
                    key={`${scale}-${attempt}-${size.width}-${size.height}-${width}`}
                    ref={canvas}
                    className="block size-full"
                    aria-hidden="true"
                />
            )}
            {near && !rendered && !error && (
                <div className="absolute inset-0 grid place-items-center bg-white text-muted-foreground">
                    <LoaderCircle
                        className="size-5 animate-spin"
                        aria-label={`Seite ${number} wird geladen`}
                    />
                </div>
            )}
            {!!error && (
                <div className="absolute inset-0 grid place-items-center bg-white p-5">
                    <ErrorState
                        error={error}
                        retry={() => setAttempt((value) => value + 1)}
                    />
                </div>
            )}
        </article>
    );
}

export default function PdfCanvasPreview({ blob }: { blob: Blob }) {
    const viewport = useRef<HTMLDivElement>(null);
    const [pdf, setPdf] = useState<PDFDocumentProxy>();
    const [size, setSize] = useState<PageSize>({ width: 595, height: 842 });
    const [error, setError] = useState<unknown>();
    const [attempt, setAttempt] = useState(0);
    const [width, setWidth] = useState(0);
    const [zoom, setZoom] = useState(100);
    const [fit, setFit] = useState(true);
    const [page, setPage] = useState(1);
    const zoomState = useRef({ zoom, fit, width, size });
    zoomState.current = { zoom, fit, width, size };
    useEffect(() => {
        let disposed = false;
        let task: PDFDocumentLoadingTask | undefined;
        setPdf(undefined);
        setError(undefined);
        setFit(true);
        setPage(1);
        void (async () => {
            try {
                const [engine, data] = await Promise.all([
                    import("pdfjs-dist/legacy/build/pdf.mjs"),
                    blob.arrayBuffer(),
                ]);
                if (disposed) return;
                engine.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
                task = engine.getDocument({
                    data: new Uint8Array(data),
                    useSystemFonts: true,
                });
                const document = await task.promise;
                if (disposed) return;
                const first = await document.getPage(1);
                if (disposed) return;
                const natural = first.getViewport({ scale: 1 });
                setSize({ width: natural.width, height: natural.height });
                setPdf(document);
            } catch (failure) {
                if (!disposed)
                    setError(
                        new Error(
                            failure instanceof Error &&
                                failure.name === "PasswordException"
                                ? "Dieses PDF ist passwortgeschützt. Bitte extern öffnen."
                                : "Das PDF konnte nicht dargestellt werden. Bitte erneut versuchen oder herunterladen.",
                        ),
                    );
            }
        })();
        return () => {
            disposed = true;
            void task?.destroy().catch(() => undefined);
        };
    }, [blob, attempt]);
    useEffect(() => {
        const node = viewport.current;
        if (!node) return;
        const resize = () => setWidth(node.clientWidth);
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    const move = (target: number) => {
        const node = viewport.current;
        const item = node?.querySelector<HTMLElement>(
            `[data-page="${target}"]`,
        );
        if (!node || !item) return;
        node.scrollTo({
            top:
                node.scrollTop +
                item.getBoundingClientRect().top -
                node.getBoundingClientRect().top -
                16,
            behavior: "instant",
        });
        setPage(target);
    };
    const changeZoom = useCallback((direction: number) => {
        const state = zoomState.current;
        const previous = state.fit
            ? ((state.width - 32) / state.size.width) * 100
            : state.zoom;
        const next = clamp(previous + direction * 10);
        const node = viewport.current;
        const top = node
            ? (node.scrollTop + node.clientHeight / 2) / previous
            : 0;
        setFit(false);
        setZoom(next);
        // Preserve the reading position around the center rather than jumping to the first page.
        requestAnimationFrame(() => {
            if (node)
                node.scrollTop = Math.max(
                    0,
                    top * next - node.clientHeight / 2,
                );
        });
    }, []);
    const fitToWidth = useCallback(() => {
        const state = zoomState.current;
        if (state.width === 0) return;
        const fittedZoom =
            Math.max(0.1, (state.width - 32) / state.size.width) * 100;
        const previousZoom = state.fit ? fittedZoom : state.zoom;
        const node = viewport.current;
        const center = node
            ? (node.scrollTop + node.clientHeight / 2) / previousZoom
            : 0;
        setFit(true);
        // A previous zoom may have scrolled the top 16px gutter out of view.
        // Restore the reading position at the fitted scale instead of keeping
        // that stale scroll offset after the page shrinks.
        requestAnimationFrame(() => {
            if (node)
                node.scrollTop = Math.max(
                    0,
                    center * fittedZoom - node.clientHeight / 2,
                );
        });
    }, []);
    useEffect(() => {
        const node = viewport.current;
        if (!node) return;
        const wheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            changeZoom(event.deltaY < 0 ? 1 : -1);
        };
        node.addEventListener("wheel", wheel, { passive: false });
        let frame = 0;
        const scroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const y = node.getBoundingClientRect().top + 32;
                let active = 1;
                for (const item of node.querySelectorAll<HTMLElement>(
                    "[data-page]",
                )) {
                    if (item.getBoundingClientRect().top <= y)
                        active = Number(item.dataset.page);
                    else break;
                }
                setPage(active);
            });
        };
        node.addEventListener("scroll", scroll, { passive: true });
        return () => {
            node.removeEventListener("wheel", wheel);
            node.removeEventListener("scroll", scroll);
            cancelAnimationFrame(frame);
        };
    }, [changeZoom]);
    const percent = Math.round(fit ? ((width - 32) / size.width) * 100 : zoom);
    return (
        <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/40"
            aria-label="PDF-Seitenansicht"
        >
            <div
                role="toolbar"
                aria-label="PDF-Ansicht steuern"
                className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-card px-3 py-2 sm:px-5"
            >
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Vorherige Seite"
                        disabled={!pdf || page <= 1}
                        onClick={() => move(page - 1)}
                    >
                        <ChevronLeft />
                    </Button>
                    <span
                        className="min-w-16 text-center text-xs tabular-nums"
                        aria-live="polite"
                    >
                        {pdf ? `${page} / ${pdf.numPages}` : "– / –"}
                    </span>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Nächste Seite"
                        disabled={!pdf || page >= pdf.numPages}
                        onClick={() => move(page + 1)}
                    >
                        <ChevronRight />
                    </Button>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Verkleinern"
                        disabled={!pdf || percent <= 25}
                        onClick={() => changeZoom(-1)}
                    >
                        <Minus />
                    </Button>
                    <span className="min-w-11 text-center text-xs tabular-nums">
                        {pdf && width ? `${percent} %` : "–"}
                    </span>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Vergrößern"
                        disabled={!pdf || percent >= 220}
                        onClick={() => changeZoom(1)}
                    >
                        <Plus />
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="An Breite anpassen"
                        title="An Breite anpassen"
                        aria-pressed={fit}
                        disabled={!pdf}
                        onClick={fitToWidth}
                    >
                        <Maximize />
                    </Button>
                </div>
            </div>
            <div
                ref={viewport}
                tabIndex={0}
                role="region"
                aria-label="PDF lesen"
                className="relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
                {error ? (
                    <div className="mx-auto max-w-lg p-6">
                        <ErrorState
                            error={error}
                            retry={() => setAttempt((value) => value + 1)}
                        />
                    </div>
                ) : !pdf ? (
                    <div
                        role="status"
                        className="grid min-h-64 place-items-center text-sm text-muted-foreground"
                    >
                        PDF-Seiten werden geladen …
                    </div>
                ) : (
                    <div className="flex min-w-full w-max flex-col items-center gap-5 p-4">
                        {Array.from({ length: pdf.numPages }, (_, index) => (
                            <PdfPage
                                key={`${attempt}-${index}`}
                                pdf={pdf}
                                number={index + 1}
                                zoom={zoom}
                                fit={fit}
                                width={width}
                                fallback={size}
                                viewport={viewport}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
