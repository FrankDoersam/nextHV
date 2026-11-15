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
    onProgress?: (percent: number) => void,
): Promise<Blob> {
    const response = await fetch(safeDocumentUrl(url), {
        credentials: "same-origin",
        signal,
        cache: "no-store",
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
    const total = Number(response.headers.get("Content-Length") ?? 0);
    if (
        !onProgress ||
        !Number.isSafeInteger(total) ||
        total <= 0 ||
        !response.body ||
        typeof TransformStream === "undefined"
    )
        return response.blob();

    // Track progress without buffering/copying chunks in JavaScript.
    // Native Response.blob() still owns the byte assembly.
    let received = 0;
    let reported = 0;
    onProgress(0);
    const stream = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                controller.enqueue(chunk);
                received += chunk.byteLength;
                const progress = Math.min(99, Math.floor(received / total * 100));
                if (progress >= reported + 5) {
                    reported = progress;
                    if (!signal.aborted) onProgress(progress);
                }
            },
        }),
    );
    const blob = await new Response(stream).blob();
    signal.throwIfAborted();
    onProgress(100);
    return blob;
}
