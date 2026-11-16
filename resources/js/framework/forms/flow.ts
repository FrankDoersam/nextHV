import type { FormRequest, Presentation, RecordData } from "../types";
import type { PanelLink } from "../navigation/panels";

export interface RecordReference {
    resource: string;
    id: number;
}
export interface FormFlowDefinition {
    id: string;
    label: string;
    steps: {
        id: string;
        label: string;
        resource: string;
        wizard?: boolean;
        reduced?: boolean;
        presentation?: Presentation;
        binding?: {
            field: string;
            source: "parent" | string;
            resource: string;
            mode?: "locked" | "prefill";
        };
    }[];
    completion?: { navigateTo: string };
}
/** Only saved references enter a deep link, never form values or personal data. */
export interface FlowState {
    id: string;
    step: number;
    parent?: RecordReference;
    records: Record<string, RecordReference>;
}
export interface FlowControls {
    label: string;
    steps: string[];
    index: number;
    onBack?: () => void;
    onSaved: (row: RecordData) => void;
}
export function flowPanel(
    definition: FormFlowDefinition,
    state: FlowState,
    key: string,
    _presentation: Presentation,
): PanelLink {
    if (
        definition.id !== state.id ||
        !Number.isInteger(state.step) ||
        state.step < 0 ||
        state.step >= definition.steps.length
    )
        throw new Error("Dieser Ablauf-Schritt ist ungültig.");
    if (
        !state.records ||
        typeof state.records !== "object" ||
        Array.isArray(state.records)
    )
        throw new Error("Ungültiger Ablaufzustand.");
    if (
        state.parent &&
        (typeof state.parent.resource !== "string" ||
            !Number.isSafeInteger(state.parent.id) ||
            state.parent.id < 1)
    )
        throw new Error("Ungültiger übergeordneter Bezug.");
    const references: FlowState["records"] = {};
    for (const [id, reference] of Object.entries(state.records)) {
        const step = definition.steps.find((s) => s.id === id);
        if (
            !reference ||
            !step ||
            step.resource !== reference.resource ||
            !Number.isSafeInteger(reference.id) ||
            reference.id < 1
        )
            throw new Error("Ungültiger gespeicherter Ablauf-Bezug.");
        references[id] = { resource: reference.resource, id: reference.id };
    }
    for (const previous of definition.steps.slice(0, state.step))
        if (!state.records[previous.id])
            throw new Error("Ein vorheriger Ablauf-Schritt fehlt.");
    state = {
        id: state.id,
        step: state.step,
        records: references,
        ...(state.parent
            ? {
                  parent: {
                      resource: state.parent.resource,
                      id: state.parent.id,
                  },
              }
            : {}),
    };
    const step = definition.steps[state.step];
    const saved = state.records[step.id];
    const source =
        step.binding?.source === "parent"
            ? state.parent
            : state.records[step.binding?.source ?? ""];
    if (step.binding && step.binding.source !== "parent" && !source)
        throw new Error("Der benötigte Ablauf-Bezug fehlt.");
    if (source && step.binding && source.resource !== step.binding.resource)
        throw new Error("Der Ablauf-Bezug gehört zum falschen Bereich.");
    const context: FormRequest["context"] =
        source && step.binding
            ? {
                  ...source,
                  field: step.binding.field,
                  mode: step.binding.mode ?? "locked",
              }
            : undefined;
    return {
        key,
        resource: step.resource,
        mode: saved ? "edit" : "create",
        id: saved?.id,
        // Multi-record workflows use the same edge Sheet at every step.
        presentation: "sheet",
        wizard: step.wizard,
        reduced: step.reduced,
        context,
        flow: state,
    };
}
export function advanceFlow(
    definition: FormFlowDefinition,
    state: FlowState,
    row: RecordData,
): FlowState {
    flowPanel(definition, state, "validation", "sheet");
    const step = definition.steps[state.step];
    return {
        ...state,
        step: state.step + 1,
        records: {
            ...state.records,
            [step.id]: { resource: step.resource, id: row.id },
        },
    };
}
