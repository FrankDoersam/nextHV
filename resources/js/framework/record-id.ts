export type RecordId = string | number;

const guid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

export function parseRecordId(value: unknown): RecordId | undefined {
    if (typeof value === "string" && guid.test(value)) return value;
    const numeric = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : value;
    return typeof numeric === "number" && Number.isSafeInteger(numeric) && numeric > 0 ? numeric : undefined;
}
