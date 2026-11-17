import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    demoOwners,
    demoSources,
    demoStages,
    demoStatuses,
    type DemoContact,
    type DemoSource,
    type DemoStage,
    type DemoStatus,
} from "./demo-contacts";

export type ContactDraft = Omit<DemoContact, "id" | "createdAt">;

const freshDraft = (contact?: DemoContact): ContactDraft => ({
    name: contact?.name ?? "",
    email: contact?.email ?? "",
    company: contact?.company ?? "",
    owner: contact?.owner ?? demoOwners[0],
    status: contact?.status ?? "Lead",
    stage: contact?.stage ?? "Neu",
    source: contact?.source ?? "Website",
    dealValue: contact?.dealValue ?? 0,
});

function FormSelect<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: readonly T[];
    onChange: (value: T) => void;
}) {
    return (
        <div className="space-y-1.5">
            <span className="block text-sm font-medium">{label}</span>
            <Select value={value} onValueChange={(next) => next && onChange(next as T)}>
                <SelectTrigger aria-label={label} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

export function ContactEditor({
    open,
    contact,
    onClose,
    onSave,
}: {
    open: boolean;
    contact?: DemoContact;
    onClose: () => void;
    onSave: (draft: ContactDraft, existing?: DemoContact) => void;
}) {
    const [draft, setDraft] = useState<ContactDraft>(() => freshDraft(contact));
    const [error, setError] = useState("");
    useEffect(() => {
        if (open) {
            setDraft(freshDraft(contact));
            setError("");
        }
    }, [open, contact]);

    const update = <K extends keyof ContactDraft>(field: K, value: ContactDraft[K]) =>
        setDraft((current) => ({ ...current, [field]: value }));
    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!draft.name.trim() || !draft.company.trim() || !draft.email.includes("@")) {
                            setError("Name, Unternehmen und eine gültige E-Mail sind erforderlich.");
                            return;
                        }
                        onSave({
                            ...draft,
                            name: draft.name.trim(),
                            email: draft.email.trim(),
                            company: draft.company.trim(),
                        }, contact);
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{contact ? "Kontakt bearbeiten" : "Kontakt hinzufügen"}</DialogTitle>
                        <DialogDescription>
                            Nur lokale Demo-Daten. Änderungen werden nicht gespeichert.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {([
                            ["name", "Name", "text"],
                            ["email", "E-Mail", "email"],
                            ["company", "Unternehmen", "text"],
                        ] as const).map(([field, label, type]) => (
                            <div key={field} className={field === "company" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
                                <label className="text-sm font-medium" htmlFor={"demo-contact-" + field}>{label}</label>
                                <Input
                                    id={"demo-contact-" + field}
                                    value={draft[field]}
                                    onChange={(event) => update(field, event.target.value)}
                                    type={type}
                                    required
                                />
                            </div>
                        ))}
                        <FormSelect label="Zuständig" value={draft.owner} options={demoOwners} onChange={(v) => update("owner", v)} />
                        <FormSelect<DemoStatus> label="Status" value={draft.status} options={demoStatuses} onChange={(v) => update("status", v)} />
                        <FormSelect<DemoStage> label="Phase" value={draft.stage} options={demoStages} onChange={(v) => update("stage", v)} />
                        <FormSelect<DemoSource> label="Quelle" value={draft.source} options={demoSources} onChange={(v) => update("source", v)} />
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-sm font-medium" htmlFor="demo-contact-value">Potenzial in EUR</label>
                            <Input
                                id="demo-contact-value"
                                type="number"
                                min={0}
                                step={1}
                                value={draft.dealValue}
                                onChange={(event) => update("dealValue", Number(event.target.value))}
                                required
                            />
                        </div>
                    </div>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button>
                        <Button type="submit">Speichern</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
