import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/** Document operations belong in Overlay.actions; page controls belong to the viewer. */
export function PdfDocumentActions({
    url,
    name,
    loading,
    onReload,
}: {
    url?: string;
    name: string;
    loading: boolean;
    onReload: () => void;
}) {
    return (
        <>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Bericht aktualisieren"
                title="Bericht aktualisieren"
                disabled={loading}
                onClick={onReload}
            >
                <RefreshCw className={loading ? "animate-spin" : undefined} />
            </Button>
            {url && (
                <>
                    <a
                        className={buttonVariants({
                            variant: "ghost",
                            size: "icon",
                        })}
                        aria-label="PDF öffnen"
                        title="PDF in neuem Tab öffnen"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <ExternalLink />
                    </a>
                    <a
                        className={buttonVariants({
                            variant: "ghost",
                            size: "icon",
                        })}
                        aria-label="PDF herunterladen"
                        title="PDF herunterladen"
                        href={url}
                        download={name}
                    >
                        <Download />
                    </a>
                </>
            )}
        </>
    );
}
