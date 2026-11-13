export interface ActionFeedback {
    ids?: number[];
    message?: string;
    severity?: "success" | "error";
    record?: Record<string, unknown>;
    navigate?: { resource: string; id: number };
}

/** Unwrap Lomkit ActionResponse::message/danger/data without treating server data as commands. */
export function extractActionFeedback(value: unknown): ActionFeedback | undefined {
    if (!value || typeof value !== "object") return undefined;
    const root = value as { data?: { result?: unknown } };
    const result = root.data?.result;
    if (!result || typeof result !== "object") return undefined;
    const response = result as {
        type?: string;
        message?: unknown;
        data?: unknown;
    };
    if (response.type === "message" || response.type === "danger") {
        if (typeof response.message !== "string") return undefined;
        return {
            message: response.message,
            severity: response.type === "danger" ? "error" : "success",
        };
    }
    if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
        return undefined;
    }
    const payload = response.data as Record<string, unknown>;
    const feedback: ActionFeedback = {};
    if (typeof payload.message === "string") feedback.message = payload.message;
    if (payload.record && typeof payload.record === "object" && !Array.isArray(payload.record)) {
        feedback.record = payload.record as Record<string, unknown>;
    }
    if (payload.navigate && typeof payload.navigate === "object") {
        const target = payload.navigate as Record<string, unknown>;
        if (typeof target.resource === "string" && typeof target.id === "number") {
            feedback.navigate = { resource: target.resource, id: target.id };
        }
    }
    if (Array.isArray(payload.ids) && payload.ids.every((id) => typeof id === "number")) {
        feedback.ids = payload.ids;
    }
    return feedback;
}
