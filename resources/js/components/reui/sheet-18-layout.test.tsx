import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet18Layout } from "./sheet-18-layout";

afterEach(cleanup);

describe("central ReUI Sheet 18 layout", () => {
    it("renders source-aligned header, prop-driven tabs, scroll area and sticky actions", () => {
        const onSubmit=vi.fn((event:FormEvent<HTMLFormElement>)=>event.preventDefault());
        const onCancel=vi.fn();
        const onDelete=vi.fn();
        render(<Sheet18Layout
            open onOpenChange={vi.fn()}
            reference="VG-2027-TAPETEN"
            title="Tapeten entfernen"
            badge={<span>Geplant</span>}
            description="Rückbau · 2 Arbeitstage"
            initialTab="details"
            tabs={[
                {value:"details",label:"Vorgang",content:<input aria-label="Testtitel" defaultValue="Tapeten entfernen" />},
                {value:"dependencies",label:"Abhängigkeiten",count:1,content:<p>Vorbereitung abgeschlossen</p>},
            ]}
            primaryLabel="Speichern" onSubmit={onSubmit} onCancel={onCancel}
            destructiveAction={{label:"Löschen",onClick:onDelete}}
        />);
        const dialog=screen.getByRole("dialog",{name:"Tapeten entfernen"});
        expect(dialog.querySelector('[data-slot="reui-sheet-18-header"]')).toBeTruthy();
        expect(dialog.querySelector('[data-slot="reui-sheet-18-scroll"]')).toBeTruthy();
        expect(dialog.querySelector('[data-slot="reui-sheet-18-footer"]')).toBeTruthy();
        expect(screen.getByText("VG-2027-TAPETEN")).toBeTruthy();
        expect(screen.getByRole("tab",{name:"Vorgang"})).toBeTruthy();
        fireEvent.click(screen.getByRole("tab",{name:/Abhängigkeiten/}));
        expect(screen.getByText("Vorbereitung abgeschlossen")).toBeTruthy();
        fireEvent.click(screen.getByRole("button",{name:"Löschen"}));
        expect(onDelete).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole("button",{name:"Abbrechen"}));
        expect(onCancel).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole("button",{name:"Speichern"}));
        expect(onSubmit).toHaveBeenCalledOnce();
    });
});