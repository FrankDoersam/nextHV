import type { FormRequest, Presentation } from "../types";
import { flowPanel, type FlowState } from "../forms/flow";
import { getFlow } from "@/modules/flows";
export interface PanelLink {
    key: string;
    resource: string;
    mode: "create" | "edit";
    id?: number;
    presentation: Presentation;
    wizard?: boolean;
    reduced?: boolean;
    context?: FormRequest["context"];
    flow?: FlowState;
}
export function readPanels(search: string): PanelLink[] {
    try {
        const value: unknown = JSON.parse(
            new URLSearchParams(search).get("panels") ?? "[]",
        );
        if (!Array.isArray(value) || value.length > 8) return [];
        const keys = new Set<string>();
        return value
            .filter((v): v is PanelLink => {
                if (
                    !v ||
                    typeof v !== "object" ||
                    typeof v.key !== "string" ||
                    v.key.length > 80 ||
                    keys.has(v.key) ||
                    typeof v.resource !== "string" ||
                    !/^[a-z-]+$/.test(v.resource) ||
                    !["create", "edit"].includes(v.mode) ||
                    !["sheet", "dialog"].includes(v.presentation) ||
                    (v.mode === "edit" &&
                        (!Number.isSafeInteger(v.id) || v.id < 1))
                )
                    return false;
                if (
                    v.context &&
                    (typeof v.context.resource !== "string" ||
                        typeof v.context.field !== "string" ||
                        !Number.isSafeInteger(v.context.id) ||
                        v.context.id < 1)
                )
                    return false;
                keys.add(v.key);
                return true;
            })
            .map((v) =>
                v.flow
                    ? flowPanel(
                          getFlow(v.flow.id),
                          v.flow,
                          v.key,
                          v.presentation,
                      )
                    : {
                          key: v.key,
                          resource: v.resource,
                          mode: v.mode,
                          presentation: v.presentation,
                          ...(v.mode === "edit" ? { id: v.id } : {}),
                          ...(v.wizard === true ? { wizard: true } : {}),
                          ...(v.reduced === true ? { reduced: true } : {}),
                          ...(v.context
                              ? {
                                    context: {
                                        resource: v.context.resource,
                                        id: v.context.id,
                                        field: v.context.field,
                                        ...(v.context.mode === "prefill"
                                            ? { mode: "prefill" as const }
                                            : {}),
                                    },
                                }
                              : {}),
                      },
            );
    } catch {
        return [];
    }
}
export function panelSearch(search: string, panels: PanelLink[]): string {
    const params = new URLSearchParams(search);
    if (panels.length) params.set("panels", JSON.stringify(panels));
    else params.delete("panels");
    return params.toString();
}
