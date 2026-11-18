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
        expect(ui("task-sheet.tsx")).toContain("Sheet18Layout");
        const shell=readFileSync("resources/js/components/reui/sheet-18-layout.tsx","utf8");
        expect(shell).toContain("tabs.map");
        expect(shell).toContain("reui-sheet-18-header");
        expect(shell).toContain("reui-sheet-18-footer");
        for (const component of ["gantt-workspace.tsx","gantt-settings.tsx","task-sheet.tsx","finance-sheet.tsx"]) {
            expect(ui(component)).toContain("className=");
            expect(ui(component)).not.toContain("@/modules/renovation-demo/");
        }
    });

    it("shares the canonical Nova icon adapter and Base controls after PR #22", () => {
        for (const component of ["gantt-bar.tsx", "gantt-nav.tsx", "gantt-view.tsx"]) {
            const source = readFileSync(
                new URL("../../components/reui/gantt/" + component, import.meta.url), "utf8",
            );
            expect(source).toContain("@/components/reui/base-icon-placeholder");
            expect(source).not.toContain("@/components/reui/icon-placeholder");
        }
        const contextMenu = readFileSync("resources/js/components/ui/context-menu.tsx", "utf8");
        expect(contextMenu).toContain("@/components/reui/base-icon-placeholder");
        expect(ui("task-sheet.tsx")).toContain("@/components/ui/alert-dialog");
        expect(ui("finance-sheet.tsx")).toContain("@/components/ui/alert-dialog");
    });
});
