import { useEffect, useState } from "react";
import { fetchPdf } from "./documents";

/** One protected fetch and one object URL shared by preview and header actions. */
export function usePdfDocument(url?: string) {
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<{
        url: string;
        attempt: number;
        blob?: Blob;
        objectUrl?: string;
        error?: unknown;
        progress?: number;
    }>();
    useEffect(() => {
        setState(undefined);
        if (!url) return;
        const controller = new AbortController();
        setState({ url, attempt });
        let objectUrl: string | undefined;
        fetchPdf(url, controller.signal, (progress) => {
            if (controller.signal.aborted) return;
            setState((previous) =>
                previous?.url === url && previous.attempt === attempt
                    ? { ...previous, progress }
                    : previous,
            );
        })
            .then((blob) => {
                if (controller.signal.aborted) return;
                objectUrl = URL.createObjectURL(blob);
                setState({ url, attempt, blob, objectUrl });
            })
            .catch((error) => {
                if (!controller.signal.aborted)
                    setState({ url, attempt, error });
            });
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url, attempt]);
    const current =
        state?.url === url && state?.attempt === attempt ? state : undefined;
    return {
        ...current,
        loading: !!url && !current?.blob && !current?.error,
        reload: () => setAttempt((value) => value + 1),
    };
}
