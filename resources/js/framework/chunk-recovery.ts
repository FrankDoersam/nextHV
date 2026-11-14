const RELOAD_MARKER = "nexthv:chunk-reload";

function errorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";
}

export function isChunkLoadError(error: unknown): boolean {
    return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|loading (?:css )?chunk \S+ failed/i.test(
        errorMessage(error),
    );
}

/** Reload at most once for each failed chunk and page URL in this tab. */
export function shouldReloadAfterChunkError(error: unknown): boolean {
    if (!isChunkLoadError(error)) return false;
    try {
        const marker = `${window.location.pathname}${window.location.search}:${errorMessage(error)}`;
        if (window.sessionStorage.getItem(RELOAD_MARKER) === marker)
            return false;
        window.sessionStorage.setItem(RELOAD_MARKER, marker);
        return true;
    } catch {
        // Storage may be disabled; avoid an uncontrolled reload loop.
        return false;
    }
}
