export const demoAsOf = "2026-11-18";
export const demoAsOfLabel = "18.11.2026";

export const euro = (value: number) =>
    new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
    }).format(value);
export const number = (value: number, digits = 0) =>
    new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(
        value,
    );

export interface DemoProperty {
    id: string;
    name: string;
    address: string;
    city: string;
    manager: string;
    yearBuilt: number;
}

export const demoProperties: readonly DemoProperty[] = [
    {
        id: "OBJ-001",
        name: "Lindenhof",
        address: "Beispielallee 8",
        city: "Berlin",
        manager: "Nora Beispiel",
        yearBuilt: 2004,
    },
    {
        id: "OBJ-002",
        name: "Hafenquartier",
        address: "Musterkai 12",
        city: "Hamburg",
        manager: "Jonas Muster",
        yearBuilt: 2018,
    },
    {
        id: "OBJ-003",
        name: "Parkterrassen",
        address: "Demopark 4",
        city: "Potsdam",
        manager: "Nora Beispiel",
        yearBuilt: 1997,
    },
    {
        id: "OBJ-004",
        name: "Sonnenbogen",
        address: "Beispielring 21",
        city: "Leipzig",
        manager: "Mira Test",
        yearBuilt: 2012,
    },
    {
        id: "OBJ-005",
        name: "Westend Höfe",
        address: "Musterstraße 17",
        city: "Köln",
        manager: "Jonas Muster",
        yearBuilt: 2008,
    },
    {
        id: "OBJ-006",
        name: "Am Stadtgarten",
        address: "Demoweg 6",
        city: "Düsseldorf",
        manager: "Mira Test",
        yearBuilt: 2021,
    },
];

export type UnitStatus = "Vermietet" | "Leerstand" | "Sanierung";
export type UnitType = "Wohnung" | "Gewerbe" | "Stellplatz";

export interface DemoUnit {
    id: string;
    propertyId: string;
    propertyName: string;
    address: string;
    city: string;
    label: string;
    type: UnitType;
    status: UnitStatus;
    areaSqm: number;
    rooms: number;
    tenant: string;
    manager: string;
    /** Monthly net rent and target rent are integer cents, never floating point euro amounts. */
    rentCents: number;
    targetRentCents: number;
    leaseStart: string | null;
    condition: number;
    rating: number;
    tags: string[];
}

const tenantFirstNames = [
    "Emma",
    "Leon",
    "Mila",
    "Finn",
    "Lina",
    "Noah",
    "Ella",
    "Ben",
    "Lea",
    "Paul",
];
const tenantLastNames = [
    "Beispiel",
    "Muster",
    "Demann",
    "Testfeld",
    "Musterling",
    "Beispielmann",
];

export function createDemoUnits(): DemoUnit[] {
    return demoProperties.flatMap((property, propertyIndex) =>
        Array.from({ length: 8 }, (_, index) => {
            const sequence = propertyIndex * 8 + index;
            const status: UnitStatus =
                (index === 5 && propertyIndex % 2 === 0) ||
                (index === 7 && propertyIndex % 2 === 1)
                    ? "Leerstand"
                    : index === 6 && propertyIndex % 3 === 0
                      ? "Sanierung"
                      : "Vermietet";
            const type: UnitType =
                index === 0
                    ? "Gewerbe"
                    : index === 7
                      ? "Stellplatz"
                      : "Wohnung";
            const areaSqm =
                type === "Stellplatz"
                    ? 14
                    : type === "Gewerbe"
                      ? 104.5 + propertyIndex * 8
                      : 42.5 + index * 8.25 + propertyIndex * 2;
            const targetRentCents =
                type === "Stellplatz"
                    ? 8500 + propertyIndex * 500
                    : Math.round(areaSqm * (1185 + propertyIndex * 85));
            const occupied = status === "Vermietet";
            return {
                id: `EH-${String(sequence + 1).padStart(3, "0")}`,
                propertyId: property.id,
                propertyName: property.name,
                address: property.address,
                city: property.city,
                label:
                    type === "Gewerbe"
                        ? "GE 01 · Erdgeschoss"
                        : type === "Stellplatz"
                          ? "SP 01 · Tiefgarage"
                          : `WE ${String(index).padStart(2, "0")} · ${Math.ceil(index / 2)}. OG ${index % 2 ? "links" : "rechts"}`,
                type,
                status,
                areaSqm,
                rooms: type === "Wohnung" ? 2 + (index % 3) : 0,
                tenant: occupied
                    ? type === "Gewerbe"
                        ? `${property.name} Musterstudio`
                        : `${tenantFirstNames[sequence % tenantFirstNames.length]} ${tenantLastNames[sequence % tenantLastNames.length]}`
                    : "",
                manager: property.manager,
                rentCents: occupied
                    ? targetRentCents -
                      (type === "Stellplatz" ? 0 : (sequence % 4) * 1250)
                    : 0,
                targetRentCents,
                leaseStart: occupied
                    ? `202${2 + (sequence % 4)}-${String(1 + (sequence % 12)).padStart(2, "0")}-01`
                    : null,
                condition:
                    status === "Sanierung"
                        ? 38 + propertyIndex * 2
                        : 78 + ((sequence * 7) % 23),
                rating:
                    status === "Sanierung" ? 2.5 : 3.5 + (sequence % 4) * 0.5,
                tags:
                    type === "Wohnung"
                        ? index % 2
                            ? ["Balkon", "Aufzug"]
                            : ["Einbauküche"]
                        : type === "Gewerbe"
                          ? ["Gewerbe"]
                          : ["Tiefgarage"],
            };
        }),
    );
}

export function unitTotals(rows: readonly DemoUnit[]) {
    const rented = rows.filter((row) => row.status === "Vermietet").length;
    return {
        properties: new Set(rows.map((row) => row.propertyId)).size,
        units: rows.length,
        rented,
        vacant: rows.filter((row) => row.status === "Leerstand").length,
        renovation: rows.filter((row) => row.status === "Sanierung").length,
        areaSqm: rows.reduce((sum, row) => sum + row.areaSqm, 0),
        rentCents: rows.reduce((sum, row) => sum + row.rentCents, 0),
        targetRentCents: rows.reduce(
            (sum, row) => sum + row.targetRentCents,
            0,
        ),
        occupancy: rows.length ? (rented / rows.length) * 100 : 0,
    };
}

export function simulateLetting(row: DemoUnit): DemoUnit {
    if (row.status !== "Leerstand") return row;
    return {
        ...row,
        status: "Vermietet",
        tenant: "Alex Demo",
        rentCents: row.targetRentCents,
        leaseStart: demoAsOf,
    };
}

export interface DemoPaymentEntry {
    id: string;
    date: string;
    amountCents: number;
    label: string;
}

export interface DemoPayment {
    id: string;
    reference: string;
    unitId: string;
    unitLabel: string;
    propertyId: string;
    propertyName: string;
    city: string;
    partner: string;
    manager: string;
    period: string;
    dueDate: string;
    /** One receivable. Amounts and payment allocations are kept as integer cents. */
    amountCents: number;
    payments: DemoPaymentEntry[];
    method: "SEPA-Lastschrift" | "Überweisung";
    category: "Nettokaltmiete" | "Stellplatzmiete" | "Gewerbemiete";
}

export type PaymentStatus =
    "Offen" | "Überfällig" | "Teilbezahlt" | "Ausgeglichen";

export function paidCents(row: DemoPayment): number {
    return row.payments.reduce((sum, entry) => sum + entry.amountCents, 0);
}

export function outstandingCents(row: DemoPayment): number {
    return row.amountCents - paidCents(row);
}

export function overdueDays(row: DemoPayment, asOf = demoAsOf): number {
    if (outstandingCents(row) <= 0) return 0;
    return Math.max(
        0,
        Math.floor(
            (Date.parse(`${asOf}T00:00:00Z`) -
                Date.parse(`${row.dueDate}T00:00:00Z`)) /
                86_400_000,
        ),
    );
}

export function paymentStatus(row: DemoPayment): PaymentStatus {
    if (outstandingCents(row) <= 0) return "Ausgeglichen";
    if (paidCents(row) > 0) return "Teilbezahlt";
    return overdueDays(row) > 0 ? "Überfällig" : "Offen";
}

export function paymentProgress(row: DemoPayment): number {
    return row.amountCents ? (paidCents(row) / row.amountCents) * 100 : 0;
}

export function createDemoPayments(): DemoPayment[] {
    const rentedUnits = createDemoUnits().filter(
        (row) => row.status === "Vermietet",
    );
    const dueDates = [
        "2026-11-03",
        "2026-11-03",
        "2026-10-03",
        "2026-11-25",
        "2026-11-18",
        "2026-10-15",
        "2026-11-03",
        "2026-12-03",
    ];
    const periods: Record<string, string> = {
        "09": "September 2026",
        "10": "Oktober 2026",
        "11": "November 2026",
        "12": "Dezember 2026",
    };
    return Array.from({ length: 48 }, (_, index) => {
        const unit = rentedUnits[index % rentedUnits.length];
        const dueDate =
            index < rentedUnits.length
                ? dueDates[index % dueDates.length]
                : "2026-09-03";
        const amountCents = unit.rentCents;
        const pattern = index % 8;
        const paid =
            pattern === 0 || pattern === 6
                ? amountCents
                : pattern === 1 || pattern === 5
                  ? Math.floor(amountCents * 0.4)
                  : 0;
        const date = dueDate < "2026-11-01" ? dueDate : "2026-11-03";
        return {
            id: `OP-${String(index + 1).padStart(4, "0")}`,
            reference: `MI-${dueDate.slice(0, 7).replace("-", "")}-${unit.id.slice(3)}`,
            unitId: unit.id,
            unitLabel: unit.label,
            propertyId: unit.propertyId,
            propertyName: unit.propertyName,
            city: unit.city,
            partner: unit.tenant,
            manager: unit.manager,
            period: periods[dueDate.slice(5, 7)],
            dueDate,
            amountCents,
            payments:
                paid > 0
                    ? [
                          {
                              id: `PAY-${String(index + 1).padStart(4, "0")}`,
                              date,
                              amountCents: paid,
                              label:
                                  paid === amountCents
                                      ? "Miete eingegangen"
                                      : "Teilzahlung eingegangen",
                          },
                      ]
                    : [],
            method: index % 3 === 0 ? "SEPA-Lastschrift" : "Überweisung",
            category:
                unit.type === "Stellplatz"
                    ? "Stellplatzmiete"
                    : unit.type === "Gewerbe"
                      ? "Gewerbemiete"
                      : "Nettokaltmiete",
        };
    });
}

export function paymentTotals(rows: readonly DemoPayment[]) {
    const amountCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
    const receivedCents = rows.reduce((sum, row) => sum + paidCents(row), 0);
    return {
        count: rows.length,
        amountCents,
        paidCents: receivedCents,
        outstandingCents: amountCents - receivedCents,
        overdueCents: rows.reduce(
            (sum, row) =>
                sum + (overdueDays(row) > 0 ? outstandingCents(row) : 0),
            0,
        ),
        overdueCount: rows.filter((row) => overdueDays(row) > 0).length,
        openCount: rows.filter((row) => outstandingCents(row) > 0).length,
        settledCount: rows.filter((row) => outstandingCents(row) === 0).length,
        progress: amountCents ? (receivedCents / amountCents) * 100 : 0,
    };
}

export function simulatePayment(row: DemoPayment): DemoPayment {
    const remaining = outstandingCents(row);
    if (remaining <= 0) return row;
    return {
        ...row,
        payments: [
            ...row.payments,
            {
                id: `SIM-${row.id}`,
                date: demoAsOf,
                amountCents: remaining,
                label: "Demo-Zahlung simuliert",
            },
        ],
    };
}
