/** Fully synthetic demo data. Nothing in this module reads nextHV's real API. */
export type DemoStatus = "Aktiv" | "Lead" | "Inaktiv";
export type DemoStage = "Neu" | "Qualifiziert" | "Verhandlung" | "Gewonnen";
export type DemoSource = "Website" | "Empfehlung" | "Event" | "Import";

export interface DemoContact {
    id: string;
    name: string;
    email: string;
    company: string;
    owner: string;
    status: DemoStatus;
    stage: DemoStage;
    source: DemoSource;
    dealValue: number;
    createdAt: string;
}

export type DemoColumnFilter = { id: string; value: unknown };
export type DemoSort = { id: string; desc: boolean };

export const demoStatuses: DemoStatus[] = ["Aktiv", "Lead", "Inaktiv"];
export const demoStages: DemoStage[] = ["Neu", "Qualifiziert", "Verhandlung", "Gewonnen"];
export const demoOwners = ["Anna Becker", "Lukas Weber", "Mia Fischer", "Noah Schmidt"];
export const demoSources: DemoSource[] = ["Website", "Empfehlung", "Event", "Import"];

const firstNames = [
    "Alex", "Taylor", "Jordan", "Robin", "Sam", "Kim",
    "Lea", "Nico", "Marlene", "David", "Elena", "Ben",
];
const lastNames = ["Meyer", "Wagner", "Schulz", "Hoffmann", "Neumann", "Berger"];
const companies = ["Northstar", "Atlas GmbH", "Helios", "Nova AG", "Komet", "Lindenwerk", "Apex", "Hansa"];

export function createDemoContacts(count = 84): DemoContact[] {
    return Array.from({ length: count }, (_, index) => {
        const first = firstNames[index % firstNames.length];
        const last = lastNames[Math.floor(index / firstNames.length) % lastNames.length];
        const day = (index % 27) + 1;
        return {
            id: "CRM-" + String(index + 1).padStart(3, "0"),
            name: first + " " + last,
            email: (first + "." + last + "." + (index + 1)).toLowerCase() + "@example.test",
            company: companies[index % companies.length],
            owner: demoOwners[index % demoOwners.length],
            status: demoStatuses[index % demoStatuses.length],
            stage: demoStages[index % demoStages.length],
            source: demoSources[Math.floor(index / 2) % demoSources.length],
            dealValue: 1200 + ((index * 731) % 35_000),
            createdAt: "2026-" + String((index % 10) + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0"),
        };
    });
}

export const initialDemoContacts = createDemoContacts();

export function filterAndSortContacts(
    contacts: DemoContact[],
    query: string,
    filters: DemoColumnFilter[],
    sorting: DemoSort[],
): DemoContact[] {
    const q = query.trim().toLocaleLowerCase("de-DE");
    const matching = contacts.filter((contact) => {
        if (q && ![contact.name, contact.email, contact.company, contact.owner, contact.id]
            .some((field) => field.toLocaleLowerCase("de-DE").includes(q))) return false;
        return filters.every(({ id, value }) => {
            if (!Array.isArray(value) || value.length === 0) return true;
            const entry = contact[id as keyof DemoContact];
            return value.includes(String(entry));
        });
    });
    if (!sorting.length) return matching;
    const collator = new Intl.Collator("de-DE", { numeric: true, sensitivity: "base" });
    return matching.sort((a, b) => {
        for (const spec of sorting) {
            const av = a[spec.id as keyof DemoContact];
            const bv = b[spec.id as keyof DemoContact];
            const diff =
                typeof av === "number" && typeof bv === "number"
                    ? av - bv
                    : collator.compare(String(av ?? ""), String(bv ?? ""));
            if (diff !== 0) return spec.desc ? -diff : diff;
        }
        return collator.compare(a.id, b.id);
    });
}

export function getDemoMetrics(contacts: DemoContact[]) {
    return {
        total: contacts.length,
        active: contacts.filter((contact) => contact.status === "Aktiv").length,
        pipeline: contacts.reduce((total, contact) => total + contact.dealValue, 0),
    };
}

export const euro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
        .format(amount);

/** Prefix spreadsheet-like formulas to prevent CSV formula injection on export. */
function escapeCsv(value: string): string {
    const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
}

export function demoContactsCsv(contacts: DemoContact[]) {
    const headers = ["ID", "Name", "E-Mail", "Unternehmen", "Zuständig", "Status", "Phase", "Quelle", "Potenzial EUR", "Erstellt"];
    const lines = contacts.map((c) =>
        [c.id, c.name, c.email, c.company, c.owner, c.status, c.stage, c.source, String(c.dealValue), c.createdAt]
            .map(escapeCsv).join(";"),
    );
    return "\uFEFF" + [headers.map(escapeCsv).join(";"), ...lines].join("\r\n");
}
