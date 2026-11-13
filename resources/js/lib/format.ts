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
export const labels: Record<string, string> = {
    month_end: "Monatsende",
    quarter_end: "Quartalsende",
    year_end: "Jahresende",
    any: "vereinbarten Tag",
    active: "Aktiv",
    archived: "Archiviert",
    draft: "Entwurf",
    ended: "Beendet",
    ready: "Nutzbar",
    maintenance: "Instandhaltung",
    residential: "Wohnen",
    commercial: "Gewerbe",
    mixed: "Gemischt",
    rental: "Mietverwaltung",
    condominium: "WEG",
    apartment: "Wohnung",
    garage: "Garage",
    parking: "Stellplatz",
    storage: "Lager",
    person: "Privatperson",
    company: "Unternehmen",
    tenant: "Mieter",
    owner: "Eigentümer",
    supplier: "Dienstleister",
    caretaker: "Hausmeister",
    guarantor: "Bürge",
    residential_lease: "Wohnraummiete",
    commercial_lease: "Gewerbemiete",
    garage_lease: "Garagenmiete",
    parking_lease: "Stellplatzmiete",
    storage_lease: "Lagermiete",
    outstanding: "Offen",
    partial: "Teilweise",
    received: "Erhalten",
    returned: "Zurückgezahlt",
    identity_card: "Personalausweis",
    passport: "Reisepass",
    residence_permit: "Aufenthaltstitel",
    other: "Sonstiges",
};
export const label = (value: unknown) =>
    labels[String(value)] ?? String(value ?? "—");
