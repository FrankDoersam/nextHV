import { useEffect, useState } from "react";
import { Overlay } from "@/components/blocks/overlay";
import { DetailList, ErrorState, Loading } from "@/components/blocks/content";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import type { Values } from "./types";
export type ActionUIResult =
    | {
          type: "document";
          title: string;
          url: string;
          mime: "application/pdf";
          name: string;
      }
    | {
          type: "details";
          title: string;
          message?: string;
          items: { label: string; value: string | number }[];
      }
    | { type: "form-patch"; values: Values; message?: string };
export function actionResult(response: unknown): ActionUIResult | undefined {
    const ui = (
        response as { data?: { result?: { data?: { ui?: ActionUIResult } } } }
    )?.data?.result?.data?.ui;
    if (!ui) return;
    if (
        "message" in ui &&
        ui.message !== undefined &&
        typeof ui.message !== "string"
    )
        throw new Error("Ungültiger Hinweis im Action-Ergebnis.");
    if (
        ui.type === "form-patch" &&
        ui.values &&
        typeof ui.values === "object" &&
        !Array.isArray(ui.values)
    )
        return ui;
    if (
        ui.type === "document" &&
        typeof ui.url === "string" &&
        ui.mime === "application/pdf" &&
        typeof ui.title === "string" &&
        typeof ui.name === "string"
    )
        return ui;
    if (
        ui.type === "details" &&
        typeof ui.title === "string" &&
        Array.isArray(ui.items) &&
        ui.items.every(
            (i) =>
                i != null &&
                typeof i === "object" &&
                typeof i.label === "string" &&
                ["string", "number"].includes(typeof i.value),
        )
    )
        return ui;
    throw new Error(
        "Unbekanntes Action-Ergebnis. Bitte den Rückgabevertrag prüfen.",
    );
}
export function safeDocumentUrl(url: string) {
    const parsed = new URL(url, window.location.origin);
    if (
        parsed.origin !== window.location.origin ||
        !parsed.pathname.startsWith("/api/")
    )
        throw new Error("Dokumentquelle ist nicht freigegeben.");
    return parsed.href;
}
function PDFPreview({
    result,
}: {
    result: Extract<ActionUIResult, { type: "document" }>;
}) {
    const [url, setUrl] = useState<string>();
    const [error, setError] = useState<unknown>();
    useEffect(() => {
        let objectUrl: string | undefined;
        const controller = new AbortController();
        void (async () => {
            try {
                const response = await fetch(safeDocumentUrl(result.url), {
                    credentials: "same-origin",
                    signal: controller.signal,
                    headers: { Accept: "application/pdf" },
                });
                if (!response.ok)
                    throw new Error(
                        "Dokument konnte nicht geladen werden. Bitte den Bericht erneut erstellen.",
                    );
                if (
                    !response.headers
                        .get("Content-Type")
                        ?.startsWith("application/pdf")
                )
                    throw new Error("Die Antwort ist kein PDF-Dokument.");
                const blob = await response.blob();
                if (controller.signal.aborted) return;
                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
            } catch (e) {
                if (!controller.signal.aborted) setError(e);
            }
        })();
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [result.url]);
    if (error) return <ErrorState error={error} />;
    if (!url) return <Loading />;
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                    <FileText className="size-4" />
                    {result.name}
                </span>
                <a
                    href={url}
                    download={result.name}
                    className="inline-flex items-center gap-2 font-medium text-primary"
                >
                    <Download className="size-4" />
                    PDF herunterladen
                </a>
            </div>
            <iframe
                src={url}
                title={result.title}
                className="h-[65dvh] w-full rounded-lg border bg-muted"
            />
            <p className="text-xs text-muted-foreground">
                Falls dein Browser keine Vorschau unterstützt, lade das PDF
                herunter.
            </p>
        </div>
    );
}
export function ActionResultOverlay({
    result,
    onClose,
}: {
    result: Exclude<ActionUIResult, { type: "form-patch" }>;
    onClose: () => void;
}) {
    return (
        <Overlay
            open
            onClose={onClose}
            presentation="dialog"
            size={result.type === "document" ? "wide" : "compact"}
            title={result.title}
            description={
                result.type === "details"
                    ? result.message
                    : "Geschützter Objektbericht"
            }
            footer={<Button onClick={onClose}>Schließen</Button>}
        >
            {result.type === "document" ? (
                <PDFPreview result={result} />
            ) : (
                <DetailList items={result.items} />
            )}
        </Overlay>
    );
}
