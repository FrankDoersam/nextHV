import { PdfPreviewSheet } from "@/components/blocks/pdf-preview-sheet";
import { Overlay } from "@/components/blocks/overlay";
import { DetailList } from "@/components/blocks/content";
import { Button } from "@/components/ui/button";
export { safeDocumentUrl } from "./data/documents";
import type { Values } from "./types";
export type ActionUIResult =
    | {
          type: "document";
          title: string;
          url: string;
          mime: "application/pdf";
          presentation?: "sheet" | "dialog";
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
        typeof ui.name === "string" &&
        (ui.presentation === undefined ||
            ui.presentation === "sheet" ||
            ui.presentation === "dialog")
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
export function ActionResultOverlay({
    result,
    onClose,
}: {
    result: Exclude<ActionUIResult, { type: "form-patch" }>;
    onClose: () => void;
}) {
    if (result.type === "document") {
        return (
            <PdfPreviewSheet
                url={result.url}
                name={result.name}
                title={result.title}
                presentation={result.presentation}
                onClose={onClose}
            />
        );
    }
    return (
        <Overlay
            open
            onClose={onClose}
            presentation="dialog"
            size="compact"
            title={result.title}
            description={result.message}
            footer={<Button onClick={onClose}>Schließen</Button>}
        >
            <DetailList items={result.items} />
        </Overlay>
    );
}
