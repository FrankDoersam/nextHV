import { useEffect, useState } from "react";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, Loading } from "./content";
import { cn } from "@/lib/utils";
import { fetchPdf } from "@/framework/data/documents";

/** The browser renders the PDF; no extra renderer, worker or font bundle. */
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
    const [source, setSource] = useState<{
        requested: string;
        blobUrl: string;
    }>();
    const [error, setError] = useState<unknown>();
    const [attempt, setAttempt] = useState(0);
    const active = source?.requested === url ? source.blobUrl : undefined;
    useEffect(() => {
        const controller = new AbortController();
        let objectUrl: string | undefined;
        setError(undefined);
        setSource(undefined);
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
    return (
        <section
            aria-label={title}
            className={cn(
                "overflow-hidden bg-stone-100",
                fill ? "flex min-h-0 flex-1 flex-col" : "rounded-xl border",
            )}
        >
            <div
                role="toolbar"
                aria-label="PDF-Werkzeuge"
                className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b bg-card p-3"
            >
                {showName && (
                    <span className="mr-auto min-w-0 truncate text-sm font-medium">
                        {name}
                    </span>
                )}
                {active && (
                    <div className="flex shrink-0 gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            aria-label="PDF aktualisieren"
                            onClick={() => setAttempt((value) => value + 1)}
                        >
                            <RefreshCw />
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            nativeButton={false}
                            role="link"
                            render={
                                <a
                                    href={active}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                />
                            }
                        >
                            <ExternalLink /> Öffnen
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            nativeButton={false}
                            role="link"
                            render={<a href={active} download={name} />}
                        >
                            <Download /> PDF
                        </Button>
                    </div>
                )}
            </div>
            {error ? (
                <ErrorState
                    error={error}
                    retry={() => setAttempt((a) => a + 1)}
                />
            ) : active ? (
                <object
                    aria-label="PDF-Seitenansicht"
                    data={`${active}#view=FitH&navpanes=0`}
                    type="application/pdf"
                    className={cn(
                        "block w-full",
                        fill ? "min-h-32 flex-1" : "h-[65dvh] min-h-72",
                    )}
                >
                    <p className="p-6 text-sm">
                        Der Browser unterstützt keine eingebettete PDF-Anzeige.{" "}
                        <a className="underline" href={active} download={name}>
                            PDF herunterladen
                        </a>
                    </p>
                </object>
            ) : (
                <Loading />
            )}
            <p className="shrink-0 border-t bg-card px-3 py-2 text-xs text-muted-foreground">
                Zoom, Seitennavigation und Druck stellt dein Browser bereit.
                Alternativ oben öffnen oder herunterladen.
            </p>
        </section>
    );
}
