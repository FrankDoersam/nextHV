import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const moduleFile = (name: string) =>
    readFileSync(new URL("./" + name, import.meta.url), "utf8");
const componentFile = (name: string) =>
    readFileSync(new URL("../../components/reui/crm-import/" + name, import.meta.url), "utf8");

describe("CRM import presentation architecture", () => {
    it("keeps rendering classes, DOM layout and ReUI anatomy out of the wizard controller", () => {
        const controller = moduleFile("original-wizard.tsx");
        expect(controller).toContain("CrmImportWizardShell");
        expect(controller).not.toContain("className=");
        expect(controller).not.toContain("data-slot=");
        expect(controller).not.toMatch(/<(?:Frame|Stepper|Tabs|Select|Item|Field|RadioGroup)(?:\s|>)/);
    });

    it("only reexports shared components from the legacy module paths", () => {
        for (const name of [
            "upload-step.tsx", "steps.tsx",
            "import-target-select.tsx", "wizard-tabs.tsx",
        ]) {
            const file = moduleFile(name);
            expect(file).toContain("@/components/reui/crm-import/");
            expect(file).not.toContain("className=");
        }
        expect(moduleFile("model.ts")).toContain("@/lib/crm-import/model");
    });

    it("centralizes presentation in a self-contained shared component directory", () => {
        for (const name of [
            "wizard-shell.tsx", "upload-step.tsx", "steps.tsx",
            "import-target-select.tsx", "wizard-tabs.tsx",
        ]) {
            const file = componentFile(name);
            expect(file).toContain("className=");
            expect(file).not.toContain("@/modules/import-wizard-demo/");
        }
    });
});
