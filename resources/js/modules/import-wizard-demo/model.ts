/** Local-only CSV preview model. The demo never sends or writes the selected files. */
export type ImportTarget = "contacts" | "companies" | "deals";
export type FileKind = "csv" | "excel" | "image" | "pdf";

export interface CsvData {
    headerRow: string[];
    rows: string[][];
    totalRows: number;
}

export interface WizardFile {
    id: string;
    name: string;
    bytes: number;
    kind: FileKind;
    data?: CsvData;
    example?: boolean;
}

export interface CsvView {
    columns: string[];
    rows: string[][];
    totalRows: number;
}

export const targetOptions: { value: ImportTarget; label: string }[] = [
    { value: "contacts", label: "Contacts" },
    { value: "companies", label: "Companies" },
    { value: "deals", label: "Deals" },
];

export const targetFields: Record<ImportTarget, { value: string; label: string }[]> = {
    contacts: [
        { value: "name", label: "Name" },
        { value: "email", label: "Email" },
        { value: "company", label: "Company" },
        { value: "phone", label: "Phone" },
    ],
    companies: [
        { value: "name", label: "Company name" },
        { value: "email", label: "Email" },
        { value: "phone", label: "Phone" },
    ],
    deals: [
        { value: "name", label: "Deal name" },
        { value: "company", label: "Company" },
        { value: "amount", label: "Amount" },
    ],
};

/** Example data mirrors the screenshot's file names and count, not real CRM data. */
export const exampleFiles: WizardFile[] = [
    {
        id: "example-csv",
        name: "northstar-contacts.csv",
        bytes: 2_350_000,
        kind: "csv",
        example: true,
        data: {
            headerRow: ["Name", "Email", "Company", "Phone"],
            totalRows: 1248,
            rows: [
                ["Alex Morgan", "alex@example.test", "Northstar", "+49 123 100"],
                ["Taylor Smith", "taylor@example.test", "Northstar", "+49 123 200"],
                ["Jordan Lee", "jordan@example.test", "Atlas", "+49 123 300"],
                ["Alex Morgan", "alex@example.test", "Northstar", "+49 123 100"],
            ],
        },
    },
    {
        id: "example-image",
        name: "account-logos.png",
        bytes: 667_970,
        kind: "image",
        example: true,
    },
];

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const supportedExtensions: Record<string, FileKind> = {
    csv: "csv",
    xlsx: "excel",
    xls: "excel",
    pdf: "pdf",
    png: "image",
    jpg: "image",
    jpeg: "image",
    webp: "image",
};

export const acceptedFileTypes = Object.keys(supportedExtensions)
    .map((extension) => "." + extension)
    .join(",");

export function kindForName(name: string): FileKind | undefined {
    return supportedExtensions[name.split(".").pop()?.toLowerCase() ?? ""];
}

export function displayFileSize(bytes: number): string {
    return bytes >= 1024 * 1024
        ? (bytes / 1_000_000).toFixed(2) + "MB"
        : (bytes / 1_000).toFixed(2) + "KB";
}

export function parseCsvText(text: string): CsvData {
    const source = text.replace(/^\uFEFF/, "");
    const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
    const separators = [",", ";", "\t"];
    const separator = separators
        .map((candidate) => ({
            candidate,
            count: firstLine.split(candidate).length - 1,
        }))
        .sort((a, b) => b.count - a.count)[0].candidate;
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue = "";
    let quoted = false;
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (char === '"') {
            if (quoted && source[i + 1] === '"') {
                currentValue += '"';
                i++;
            } else {
                quoted = !quoted;
            }
        } else if (char === separator && !quoted) {
            currentRow.push(currentValue);
            currentValue = "";
        } else if ((char === "\r" || char === "\n") && !quoted) {
            if (char === "\r" && source[i + 1] === "\n") i++;
            currentRow.push(currentValue);
            if (currentRow.some((cell) => cell.trim())) rows.push(currentRow);
            currentRow = [];
            currentValue = "";
        } else {
            currentValue += char;
        }
    }
    if (quoted) throw new Error("CSV contains an unclosed quoted value.");
    currentRow.push(currentValue);
    if (currentRow.some((cell) => cell.trim())) rows.push(currentRow);
    if (!rows.length || !rows[0].some((cell) => cell.trim())) {
        throw new Error("CSV is empty.");
    }
    const [headerRow, ...body] = rows;
    return { headerRow, rows: body, totalRows: body.length };
}

export async function loadSelectedFiles(selected: File[]): Promise<{
    files: WizardFile[];
    errors: string[];
}> {
    const files: WizardFile[] = [];
    const errors: string[] = [];
    for (const [index, file] of selected.entries()) {
        const kind = kindForName(file.name);
        if (!kind) {
            errors.push(file.name + ": file type not supported.");
            continue;
        }
        if (file.size > MAX_FILE_BYTES) {
            errors.push(file.name + ": maximum 10 MB per file.");
            continue;
        }
        try {
            const data = kind === "csv" ? parseCsvText(await file.text()) : undefined;
            files.push({
                id: "local-" + index + "-" + file.name + "-" + file.lastModified,
                name: file.name,
                bytes: file.size,
                kind,
                data,
            });
        } catch (error) {
            errors.push(
                file.name + ": " + (error instanceof Error ? error.message : "cannot read file"),
            );
        }
    }
    return { files, errors };
}

export function viewForFile(
    file: WizardFile | undefined,
    firstRowIsHeader: boolean,
): CsvView | undefined {
    if (!file?.data) return undefined;
    const { headerRow, rows, totalRows } = file.data;
    if (firstRowIsHeader) {
        return { columns: headerRow, rows: rows.slice(0, 8), totalRows };
    }
    return {
        columns: headerRow.map((_, index) => "Column " + (index + 1)),
        rows: [headerRow, ...rows].slice(0, 8),
        totalRows: totalRows + 1,
    };
}

export function automaticField(
    column: string,
    target: ImportTarget,
): string | undefined {
    const normalized = column.toLowerCase().replace(/[^a-z0-9]/g, "");
    return targetFields[target].find(
        (field) => field.value.replace(/[^a-z0-9]/g, "") === normalized,
    )?.value;
}

/** Counts duplicates in the *preview sample*, never claims to scan the full dataset. */
export function previewDuplicateCount(
    view: CsvView | undefined,
    mapping: Record<string, string>,
): number {
    if (!view) return 0;
    const emailColumn = view.columns.findIndex(
        (column) => mapping[column] === "email" || column.toLowerCase() === "email",
    );
    const index = emailColumn >= 0 ? emailColumn : 0;
    const seen = new Set<string>();
    let count = 0;
    for (const row of view.rows) {
        const key = (row[index] ?? "").trim().toLowerCase();
        if (!key) continue;
        if (seen.has(key)) count++;
        else seen.add(key);
    }
    return count;
}
