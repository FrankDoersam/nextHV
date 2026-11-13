export function safeDocumentUrl(url: string) {
    const parsed = new URL(url, window.location.origin);
    if (
        parsed.origin !== window.location.origin ||
        !parsed.pathname.startsWith("/api/")
    )
        throw new Error("Dokumentquelle ist nicht freigegeben.");
    return parsed.href;
}
export async function fetchPdf(
    url: string,
    signal: AbortSignal,
): Promise<Blob> {
    const response = await fetch(safeDocumentUrl(url), {
        credentials: "same-origin",
        signal,
        headers: { Accept: "application/pdf" },
    });
    if (response.status === 401)
        window.dispatchEvent(new Event("auth:expired"));
    if (!response.ok)
        throw new Error(
            "Das Dokument ist nicht verfügbar. Bitte den Bericht erneut erstellen oder die Sitzung prüfen.",
        );
    if (!response.headers.get("Content-Type")?.startsWith("application/pdf"))
        throw new Error("Die Antwort ist kein PDF-Dokument.");
    return response.blob();
}
