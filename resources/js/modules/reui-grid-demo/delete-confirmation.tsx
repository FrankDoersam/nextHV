import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function DemoDeleteConfirmation({
    count,
    onCancel,
    onConfirm,
}: {
    count: number;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <Dialog open={count > 0} onOpenChange={(next) => { if (!next) onCancel(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{count} Demo-Datensatz{count === 1 ? "" : "s"} löschen?</DialogTitle>
                    <DialogDescription>
                        Die ausgewählten Dummy-Kontakte werden nur aus dem lokalen Demo-Zustand entfernt.
                        Die echte nextHV-Datenbank wird nicht verändert.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onCancel}>Abbrechen</Button>
                    <Button type="button" variant="destructive" onClick={onConfirm}>Löschen</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
