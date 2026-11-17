import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controller = (file: string) =>
    readFileSync(new URL(file, import.meta.url), "utf8");
const ui = (file: string) =>
    readFileSync(new URL("../../components/reui/renovation/" + file, import.meta.url), "utf8");

describe("ReUI Renovation architecture", () => {
    it("owns no layout, class names, Dialog or Sheet inside the planner controller", () => {
        const source = controller("./renovation-planner.tsx");
        expect(source).not.toContain("className=");
        expect(source).not.toMatch(/<(?:Gantt|Sheet|Dialog|Popover|Frame)(?:\s|>)/);
        expect(source).toContain("RenovationGanttWorkspace");
        expect(source).toContain("TaskEditor");
        expect(source).toContain("FinanceSheet");
    });
    it("moves full editor and finance presentation to shared ReUI components", () => {
        expect(controller("./task-editor.tsx")).toContain("@/components/reui/renovation/task-sheet");
        expect(controller("./finance-sheet.tsx")).toContain("@/components/reui/renovation/finance-sheet");
        for (const component of ["gantt-workspace.tsx","gantt-settings.tsx","task-sheet.tsx","finance-sheet.tsx"]) {
            expect(ui(component)).toContain("className=");
            expect(ui(component)).not.toContain("@/modules/renovation-demo/");
        }
    });
});
