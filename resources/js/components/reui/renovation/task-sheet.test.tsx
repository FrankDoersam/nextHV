import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TASKS, type RenovationTask } from "@/lib/renovation/plan";
import { TaskEditor } from "./task-sheet";

afterEach(cleanup);

describe("renovation timeline entry edit Sheet", () => {
    it("keeps all fields and dependency choices in the reusable ReUI Sheet 18 layout", () => {
        const task=DEFAULT_TASKS.find(entry=>entry.id==="tapeten")!;
        const onSave=vi.fn((_entry:RenovationTask) => undefined);
        render(<TaskEditor task={task} allTasks={DEFAULT_TASKS}
            onCancel={vi.fn()} onSave={onSave} onDelete={vi.fn(() => undefined)} />);
        const dialog=screen.getByRole("dialog",{name:"Tapeten entfernen"});
        expect(dialog.querySelector('[data-slot="reui-sheet-18-header"]')).toBeTruthy();
        expect(dialog.querySelector('[data-slot="reui-sheet-18-footer"]')).toBeTruthy();
        expect(screen.getByRole("combobox",{name:"Gewerk",exact:true})).toBeTruthy();
        expect(screen.getByRole("tab",{name:"Vorgang"})).toBeTruthy();
        fireEvent.click(screen.getByRole("tab",{name:/Abhängigkeiten/}));
        expect(screen.getByRole("checkbox",{name:"Baustelle einrichten & schützen als Vorgänger"})).toBeTruthy();
        fireEvent.click(screen.getByRole("tab",{name:"Vorgang"}));
        fireEvent.change(screen.getByRole("textbox",{name:"Bezeichnung"}),{target:{value:"Tapeten und Putz entfernen"}});
        fireEvent.click(screen.getByRole("button",{name:"Speichern"}));
        expect(onSave).toHaveBeenCalledOnce();
        expect(onSave.mock.calls[0][0].title).toBe("Tapeten und Putz entfernen");
    });
});