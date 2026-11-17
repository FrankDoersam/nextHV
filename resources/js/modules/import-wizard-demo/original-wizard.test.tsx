import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReuiOriginalImportWizard } from "./original-wizard";

afterEach(cleanup);

describe("ReUI horizontal Stepper reference", () => {
    it("shows five original navigation steps and local upload area", () => {
        render(<ReuiOriginalImportWizard />);
        expect(screen.getByRole("heading",{name:"Upload Files"})).toBeTruthy();
        expect(screen.getByRole("tablist")).toBeTruthy();
        expect(screen.getByRole("tab",{name:/Map Columns/})).toBeTruthy();
        expect(screen.getByRole("button",{name:/Drop Files/})).toBeTruthy();
    });
});
