export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public errors: Record<string, string[]> = {},
        public confirmation?: { token: string; expires_at: string },
    ) {
        super(message);
    }
}
let csrfPromise: Promise<void> | undefined;
export function csrf(): Promise<void> {
    return (csrfPromise ??= fetch("/sanctum/csrf-cookie", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
    })
        .then((r) => {
            if (!r.ok)
                throw new Error("Sitzung konnte nicht vorbereitet werden.");
        })
        .finally(() => {
            csrfPromise = undefined;
        }));
}
export async function request<T>(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    signal?: AbortSignal,
): Promise<T> {
    const token = document.cookie
        .split("; ")
        .find((c) => c.startsWith("XSRF-TOKEN="))
        ?.slice(11);
    const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
    };
    if (token) headers["X-XSRF-TOKEN"] = decodeURIComponent(token);
    if (body !== undefined && !(body instanceof FormData))
        headers["Content-Type"] = "application/json";
    const response = await fetch(path, {
        method,
        signal,
        credentials: "same-origin",
        headers,
        body:
            body === undefined
                ? undefined
                : body instanceof FormData
                  ? body
                  : JSON.stringify(body),
    });
    const result = await response
        .json()
        .catch(() => ({ message: "Die Antwort konnte nicht gelesen werden." }));
    if (!response.ok) {
        if (response.status === 401)
            window.dispatchEvent(new Event("auth:expired"));
        throw new ApiError(
            response.status,
            (response.status === 422 && result.errors
                ? Object.values(result.errors as Record<string, string[]>)
                      .flat()
                      .join(" ")
                : result.message) ?? "Die Anfrage ist fehlgeschlagen.",
            result.errors ?? {},
            result.confirmation,
        );
    }
    return result as T;
}
