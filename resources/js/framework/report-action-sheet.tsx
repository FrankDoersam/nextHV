import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { PdfPreviewSheet } from "@/components/blocks/pdf-preview-sheet";
import { actionAvailability, type ResourceAction } from "./actions";
import { actionResult } from "./action-results";
import type { ActionContext } from "./types";

/** Read-only report actions open their final surface immediately, including pending/error states. */
export function ReportActionSheet({
    action,
    context,
    onClose,
}: {
    action: ResourceAction;
    context: ActionContext;
    onClose: () => void;
}) {
    const session = useId();
    const query = useQuery({
        queryKey: ["report-preview", session],
        queryFn: async ({ signal }) => {
            if (actionAvailability(action, context) !== true)
                throw new Error("Dieser Bericht ist derzeit nicht verfügbar.");
            const response = await action.execute(context, signal);
            signal.throwIfAborted();
            const result = actionResult(response);
            if (result?.type !== "document")
                throw new Error(
                    "Die Report-Action hat kein PDF-Dokument zurückgegeben.",
                );
            return result;
        },
        retry: false,
        gcTime: 0,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });
    return (
        <PdfPreviewSheet
            url={query.data?.url}
            name={query.data?.name}
            title={query.data?.title ?? action.label}
            presentation={query.data?.presentation}
            loading={query.isFetching}
            error={query.error}
            onRetry={() => void query.refetch()}
            onClose={onClose}
        />
    );
}
