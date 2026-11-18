import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Canonical reusable Base primitives; no demo-specific components. */
const baseComponents = [
    { name: "Badge", importPath: "@/components/reui/badge", file: "./badge.tsx" },
    { name: "Cascader", importPath: "@/components/reui/cascader/cascader", file: "./cascader/cascader.tsx" },
    { name: "DataGrid", importPath: "@/components/reui/data-grid/data-grid", file: "./data-grid/data-grid.tsx" },
    { name: "Filters", importPath: "@/components/reui/filters/filters", file: "./filters/filters.tsx" },
    { name: "Frame", importPath: "@/components/reui/frame", file: "./frame.tsx" },
    { name: "AlertDialog", importPath: "@/components/ui/alert-dialog", file: "../ui/alert-dialog.tsx" },
    { name: "Avatar", importPath: "@/components/ui/avatar", file: "../ui/avatar.tsx" },
    { name: "Button", importPath: "@/components/ui/button", file: "../ui/button.tsx" },
    { name: "Checkbox", importPath: "@/components/ui/checkbox", file: "../ui/checkbox.tsx" },
    { name: "Dialog", importPath: "@/components/ui/dialog", file: "../ui/dialog.tsx" },
    { name: "DropdownMenu", importPath: "@/components/ui/dropdown-menu", file: "../ui/dropdown-menu.tsx" },
    { name: "Field", importPath: "@/components/ui/field", file: "../ui/field.tsx" },
    { name: "Input", importPath: "@/components/ui/input", file: "../ui/input.tsx" },
    { name: "InputGroup", importPath: "@/components/ui/input-group", file: "../ui/input-group.tsx" },
    { name: "Item", importPath: "@/components/ui/item", file: "../ui/item.tsx" },
    { name: "Popover", importPath: "@/components/ui/popover", file: "../ui/popover.tsx" },
    { name: "Progress", importPath: "@/components/ui/progress", file: "../ui/progress.tsx" },
    { name: "ScrollArea", importPath: "@/components/ui/scroll-area", file: "../ui/scroll-area.tsx" },
    { name: "Select", importPath: "@/components/ui/select", file: "../ui/select.tsx" },
    { name: "Separator", importPath: "@/components/ui/separator", file: "../ui/separator.tsx" },
    { name: "Sheet", importPath: "@/components/ui/sheet", file: "../ui/sheet.tsx" },
    { name: "Skeleton", importPath: "@/components/ui/skeleton", file: "../ui/skeleton.tsx" },
    { name: "Spinner", importPath: "@/components/ui/spinner", file: "../ui/spinner.tsx" },
    { name: "Switch", importPath: "@/components/ui/switch", file: "../ui/switch.tsx" },
    { name: "Textarea", importPath: "@/components/ui/textarea", file: "../ui/textarea.tsx" },
    { name: "Tooltip", importPath: "@/components/ui/tooltip", file: "../ui/tooltip.tsx" },
] as const;

describe("NextHV ReUI Base API", () => {
    it("keeps all 26 canonical Base components installed", () => {
        expect(baseComponents).toHaveLength(26);
        for (const component of baseComponents) {
            const source = readFileSync(new URL(component.file, import.meta.url), "utf8");
            expect(source.length, component.name + " is empty").toBeGreaterThan(0);
        }
    });

    it("exports every Base component from one non-duplicating entry point", () => {
        const source = readFileSync("resources/js/components/reui/base.ts", "utf8");
        for (const component of baseComponents) {
            expect(source).toContain("export { " + component.name + ' } from "' + component.importPath + '";');
        }
    });
});
