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
    }>();
    useEffect(() => {
        setState(undefined);
        if (!url) return;
        const controller = new AbortController();
        let objectUrl: string | undefined;
        fetchPdf(url, controller.signal)
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
        loading: !!url && !current,
        reload: () => setAttempt((value) => value + 1),
    };
}
