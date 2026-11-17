import { Archive, Copy, Ellipsis, Pencil, RotateCcw, Trash2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { DemoContact } from "./demo-contacts";

export type ContactAction = "edit" | "duplicate" | "toggle-status" | "delete";

export function ContactRowActions({
    contact,
    onAction,
}: {
    contact: DemoContact;
    onAction: (action: ContactAction, contact: DemoContact) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={"Aktionen für " + contact.name}>
                        <Ellipsis aria-hidden="true" className="size-4" />
                    </Button>
                }
            />
            <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem onClick={() => onAction("edit", contact)}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Bearbeiten
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction("duplicate", contact)}>
                    <Copy className="size-4" aria-hidden="true" />
                    Duplizieren
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction("toggle-status", contact)}>
                    {contact.status === "Inaktiv"
                        ? <RotateCcw className="size-4" aria-hidden="true" />
                        : <Archive className="size-4" aria-hidden="true" />}
                    {contact.status === "Inaktiv" ? "Reaktivieren" : "Archivieren"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onAction("delete", contact)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    Löschen
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
