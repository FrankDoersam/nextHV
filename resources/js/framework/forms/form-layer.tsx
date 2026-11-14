import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, Loading } from "@/components/blocks/content";
import { Overlay } from "@/components/blocks/overlay";
import { getResource } from "@/modules/registry";
import { resolveDataProvider } from "../data/provider-registry";
import type { FormRequest, RecordData } from "../types";
import type { PanelLink } from "../navigation/panels";
import { ResourceEditor } from "./resource-editor";
import { ResourceView } from "./resource-view";
import type { FlowControls } from "./flow";
export function FormLayer({
    panel,
    cached,
    onClose,
    onDirtyChange,
    onEdit,
    onSaved,
    nested,
    stacked,
    flow,
}: {
    panel: PanelLink;
    cached?: FormRequest;
    onClose: () => void;
    onDirtyChange: (value: boolean) => void;
    onEdit: (row: RecordData, fields?: string[]) => void;
    onSaved: (row: RecordData) => void;
    nested?: ReactNode;
    stacked: boolean;
    flow?: FlowControls;
}) {
    let resource: FormRequest["resource"] | undefined;
    try {
        resource = cached?.resource ?? getResource(panel.resource);
    } catch {
        /* Bad deep links render a recoverable state. */
    }
    const hydration = useQuery({
        queryKey: [
            "panel",
            panel.key,
            panel.resource,
            panel.id,
            panel.context,
            panel.mode,
            panel.fields,
        ],
        enabled: !!resource,
        queryFn: async () => {
            if (
                panel.fields?.some(
                    (name) =>
                        !resource!.fields.some(
                            (field) =>
                                field.name === name &&
                                !field.readonlyOnEdit &&
                                !field.disabled,
                        ),
                )
            )
                throw new Error(
                    "Der Direktlink enthält nicht bearbeitbare Felder.",
                );
            if (panel.context) {
                const field = resource!.fields.find(
                    (f) =>
                        f.name === panel.context!.field &&
                        f.kind === "relation" &&
                        f.resource === panel.context!.resource,
                );
                if (!field) throw new Error("Der Formularbezug ist ungültig.");
                await resolveDataProvider(getResource(panel.context.resource)).one(
                    getResource(panel.context.resource),
                    panel.context.id,
                );
            }
            const row =
                panel.mode !== "create"
                    ? (cached?.row ??
                      (await resolveDataProvider(resource!).one(resource!, panel.id!)))
                    : null;
            if (
                row &&
                panel.context &&
                Number(row[panel.context.field]) !== panel.context.id
            )
                throw new Error(
                    "Dieser Datensatz gehört nicht zum übergeordneten Bezug.",
                );
            return row;
        },
        staleTime: Infinity,
        gcTime: 0,
    });
    if (!resource || hydration.error || hydration.isPending)
        return (
            <Overlay
                open
                onClose={onClose}
                title={resource?.singular ?? "Formular"}
                presentation={panel.presentation}
                nested={nested}
            >
                <>
                    {hydration.error || !resource ? (
                        <ErrorState
                            error={
                                hydration.error ??
                                new Error("Unbekannter Bereich im Direktlink.")
                            }
                        />
                    ) : (
                        <Loading />
                    )}
                </>
            </Overlay>
        );
    const request: FormRequest = {
        ...cached,
        resource,
        mode: panel.mode,
        row: hydration.data ?? undefined,
        presentation: panel.presentation,
        wizard: panel.wizard,
        reduced: panel.reduced,
        fields: panel.fields,
        context: panel.context,
        defaults: {
            ...cached?.defaults,
            ...(panel.context
                ? { [panel.context.field]: panel.context.id }
                : {}),
        },
        onSaved: async (row) => {
            onSaved(row);
            await cached?.onSaved?.(row);
        },
    };
    if (panel.mode === "view" && hydration.data)
        return (
            <ResourceView
                request={{ ...request, row: hydration.data }}
                onClose={onClose}
                onEdit={onEdit}
                nested={nested}
                stacked={stacked}
            />
        );
    return (
        <ResourceEditor
            request={request}
            onClose={onClose}
            onDirtyChange={onDirtyChange}
            nested={nested}
            stacked={stacked}
            flow={flow}
        />
    );
}
