import type { FormRequest, Presentation } from "../types";
import { flowPanel, type FlowState } from "../forms/flow";
import { getFlow } from "@/modules/flows";
export interface PanelLink {
    key: string;
    resource: string;
    mode: FormRequest["mode"];
    id?: number;
    presentation: Presentation;
    wizard?: boolean;
    reduced?: boolean;
    fields?: string[];
    returnToView?: boolean;
    context?: FormRequest["context"];
    flow?: FlowState;
}
export const panelKey = (index: number) => `p${index + 1}`;

export function readPanels(search: string): PanelLink[] {
    try {
        const params = new URLSearchParams(search);
        const value: unknown = params.has("panel")
            ? compactPanels(params)
            : JSON.parse(params.get("panels") ?? "[]");
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
                    !["create", "edit", "view"].includes(v.mode) ||
                    !["sheet", "dialog"].includes(v.presentation) ||
                    (v.mode !== "create" &&
                        (!Number.isSafeInteger(v.id) || v.id < 1))
                )
                    return false;
                if (
                    v.fields !== undefined &&
                    (v.mode !== "edit" ||
                        !Array.isArray(v.fields) ||
                        !v.fields.length ||
                        v.fields.length > 100 ||
                        v.fields.some(
                            (field: unknown) =>
                                typeof field !== "string" ||
                                !/^[a-zA-Z_][a-zA-Z0-9_]{0,79}$/.test(field),
                        ))
                )
                    return false;
                if (
                    v.context &&
                    (typeof v.context.resource !== "string" ||
                        typeof v.context.field !== "string" ||
                        !/^[a-z-]+$/.test(v.context.resource) ||
                        !/^[a-zA-Z_][a-zA-Z0-9_]{0,79}$/.test(
                            v.context.field,
                        ) ||
                        !Number.isSafeInteger(v.context.id) ||
                        v.context.id < 1)
                )
                    return false;
                keys.add(v.key);
                return true;
            })
            .map((v, index) =>
                v.flow
                    ? flowPanel(
                          getFlow(v.flow.id),
                          v.flow,
                          panelKey(index),
                          "sheet",
                      )
                    : {
                          key: panelKey(index),
                          resource: v.resource,
                          mode: v.mode,
                          presentation:
                              v.wizard === true ? "sheet" : v.presentation,
                          ...(v.mode !== "create" ? { id: v.id } : {}),
                          ...(v.fields
                              ? { fields: [...new Set(v.fields)] }
                              : {}),
                          ...(v.mode === "edit" && v.returnToView === true
                              ? { returnToView: true }
                              : {}),
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
/** Public links contain record references and display options, never UUIDs or form values. */
const optionNames = [
    "panel",
    "parent",
    "bind",
    "prefill",
    "layout",
    "wizard",
    "reduced",
    "fields",
    "back",
    "flow",
    "step",
    "records",
];
const prefixFor = (index: number) => (index ? `p${index + 1}.` : "");
function reference(value: string | null) {
    const match = value?.match(/^([a-z-]+)\/([1-9]\d*)$/);
    if (!match || !Number.isSafeInteger(Number(match[2])))
        throw new Error("Ungültiger Bezug");
    return { resource: match[1], id: Number(match[2]) };
}
function compactPanels(params: URLSearchParams): PanelLink[] {
    const panels: PanelLink[] = [];
    for (let index = 0; index < 8; index++) {
        const prefix = prefixFor(index);
        const get = (name: string) => params.get(prefix + name);
        const descriptor = get("panel");
        if (!descriptor) break;
        const match = descriptor.match(
            /^([a-z-]+)\/(new|[1-9]\d*\/(edit|view))$/,
        );
        if (!match) throw new Error("Ungültiger Formularlink");
        const parent = get("parent") ? reference(get("parent")) : undefined;
        const panel: PanelLink = {
            key: panelKey(index),
            resource: match[1],
            mode: match[2] === "new" ? "create" : (match[3] as "edit" | "view"),
            presentation:
                get("wizard") === "1" || get("flow")
                    ? "sheet"
                    : ((get("layout") ?? "sheet") as Presentation),
            ...(match[2] !== "new"
                ? { id: Number(match[2].split("/")[0]) }
                : {}),
            ...(get("wizard") === "1" ? { wizard: true } : {}),
            ...(get("reduced") === "1" ? { reduced: true } : {}),
            ...(get("fields") !== null
                ? { fields: get("fields")!.split(",") }
                : {}),
            ...(get("back") === "view" ? { returnToView: true } : {}),
            ...(parent && get("bind")
                ? {
                      context: {
                          ...parent,
                          field: get("bind")!,
                          ...(get("prefill") === "1"
                              ? { mode: "prefill" as const }
                              : {}),
                      },
                  }
                : {}),
        };
        if (get("flow")) {
            const records: FlowState["records"] = {};
            for (const entry of get("records")?.split(",") ?? []) {
                const [step, ...record] = entry.split(":");
                if (!/^[a-z-]+$/.test(step) || Object.hasOwn(records, step))
                    throw new Error("Ungültiger Ablaufbezug");
                records[step] = reference(record.join(":"));
            }
            panel.flow = {
                id: get("flow")!,
                step: Number(get("step") ?? 0),
                records,
                ...(parent ? { parent } : {}),
            };
        } else if ((get("bind") && !parent) || (parent && !get("bind")))
            throw new Error("Unvollständiger Bezug");
        panels.push(panel);
    }
    if (
        Array.from(params.keys()).some(
            (key) =>
                /^(?:p\d+\.)?panel$/.test(key) &&
                !panels.some((_, i) => prefixFor(i) + "panel" === key),
        )
    )
        throw new Error("Ungültiger Formularstapel");
    return panels;
}
export function panelSearch(search: string, panels: PanelLink[]): string {
    const params = new URLSearchParams(search);
    params.delete("panels");
    for (const key of Array.from(params.keys())) {
        if (optionNames.includes(key.replace(/^p\d+\./, "")))
            params.delete(key);
    }
    panels.forEach((panel, index) => {
        const set = (name: string, value: string) =>
            params.set(prefixFor(index) + name, value);
        set(
            "panel",
            `${panel.resource}/${panel.mode === "create" ? "new" : `${panel.id}/${panel.mode}`}`,
        );
        if (
            panel.presentation !== "sheet" &&
            !panel.wizard &&
            !panel.flow
        )
            set("layout", panel.presentation);
        if (panel.flow) {
            set("flow", panel.flow.id);
            set("step", String(panel.flow.step));
            if (panel.flow.parent)
                set(
                    "parent",
                    `${panel.flow.parent.resource}/${panel.flow.parent.id}`,
                );
            const records = Object.entries(panel.flow.records).map(
                ([step, ref]) => `${step}:${ref.resource}/${ref.id}`,
            );
            if (records.length) set("records", records.join(","));
        } else {
            if (panel.context) {
                set("parent", `${panel.context.resource}/${panel.context.id}`);
                set("bind", panel.context.field);
                if (panel.context.mode === "prefill") set("prefill", "1");
            }
            if (panel.wizard) set("wizard", "1");
            if (panel.reduced) set("reduced", "1");
            if (panel.fields) set("fields", panel.fields.join(","));
            if (panel.returnToView) set("back", "view");
        }
    });
    return params
        .toString()
        .replace(/%2F/gi, "/")
        .replace(/%2C/gi, ",")
        .replace(/%3A/gi, ":");
}
