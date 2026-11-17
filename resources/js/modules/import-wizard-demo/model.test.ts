import { describe, expect, it } from "vitest";
import {
    automaticField,
    kindForName,
    parseCsvText,
    previewDuplicateCount,
    viewForFile,
    exampleFiles,
} from "./model";

describe("ReUI import wizard demo model", () => {
    it("parses CSV and handles BOM, quoted delimiters and embedded newlines", () => {
        const parsed = parseCsvText('\uFEFFName;Email\n"Smith; John";john@example.test\n"Taylor\nLee";taylor@example.test');
        expect(parsed.headerRow).toEqual(["Name", "Email"]);
        expect(parsed.rows).toEqual([
            ["Smith; John", "john@example.test"],
            ["Taylor\nLee", "taylor@example.test"],
        ]);
        expect(parsed.totalRows).toBe(2);
    });

    it("rejects malformed and empty CSV data", () => {
        expect(() => parseCsvText("")).toThrow("CSV is empty");
        expect(() => parseCsvText('Name,Email\n"Unclosed,value')).toThrow("unclosed");
    });

    it("uses the supplied example only as a local preview", () => {
        const view = viewForFile(exampleFiles[0], true);
        expect(view?.totalRows).toBe(1248);
        expect(view?.rows).toHaveLength(4);
        expect(previewDuplicateCount(view, {})).toBe(1);
        expect(viewForFile(exampleFiles[0], false)?.columns[0]).toBe("Column 1");
    });

    it("recognizes source types and automatic field labels", () => {
        expect(kindForName("export.CSV")).toBe("csv");
        expect(kindForName("archive.zip")).toBeUndefined();
        expect(automaticField("Email", "contacts")).toBe("email");
    });
});
