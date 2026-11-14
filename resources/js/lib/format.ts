export const money = (value: unknown) =>
    new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
    }).format(Number(value ?? 0));
export const number = (value: unknown, digits = 0) =>
    new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(
        Number(value ?? 0),
    );
export const date = (value: unknown) => {
    if (!value) return "—";
    const parsed = new Date(String(value).slice(0, 10) + "T12:00:00");
    return Number.isNaN(parsed.getTime())
        ? "—"
        : new Intl.DateTimeFormat("de-DE", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
          }).format(parsed);
};
/** Domain value labels are loaded from PHP REST metadata before resources mount. */
export const labels: Record<string, string> = {};
export function registerLabels(values: Record<string, string>) {
    for (const key of Object.keys(labels)) delete labels[key];
    Object.assign(labels, values);
}
export const label = (value: unknown) =>
    labels[String(value)] ?? String(value ?? "—");
