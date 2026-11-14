import { FieldGrid } from "@/components/blocks/layout";
import { ResourceField } from "@/components/fields/field";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { CreateRelationDefinition, Values } from "../types";
import { creationFields, creationRow } from "./create-relations";

/** Reuses the child's hydrated PHP field schema, without an editable parent reference. */
export function RelationRepeater({
    definition,
    disabled,
}: {
    definition: CreateRelationDefinition;
    disabled?: boolean;
}) {
    const { control, getValues } = useFormContext<Record<string, Values[]>>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: definition.relation,
    });
    const definitions = creationFields(definition);
    return (
        <section
            data-slot="relation-repeater"
            aria-label={definition.label}
            className="space-y-4"
        >
            <p className="text-xs leading-5 text-muted-foreground">
                Die Einträge werden gemeinsam gespeichert und automatisch
                zugeordnet.
            </p>
            {fields.map((row, index) => (
                <section
                    key={row.id}
                    aria-label={`${definition.singular} ${index + 1}`}
                    className="overflow-hidden rounded-xl border bg-card"
                >
                    <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5">
                        <h3 className="text-sm font-medium">
                            {definition.singular}{" "}
                            <span className="text-muted-foreground">
                                {index + 1}
                            </span>
                        </h3>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={disabled}
                            aria-label={`${definition.singular} ${index + 1} entfernen`}
                            onClick={() => remove(index)}
                        >
                            <Trash2 />
                        </Button>
                    </header>
                    <div className="p-4">
                        <FieldGrid>
                            {definitions.map((field) => (
                                <ResourceField
                                    key={field.name}
                                    definition={{
                                        ...field,
                                        disabled: disabled || field.disabled,
                                        name: `${definition.relation}.${index}.${field.name}`,
                                    }}
                                />
                            ))}
                        </FieldGrid>
                    </div>
                </section>
            ))}
            {!fields.length && (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Noch keine Einträge. Du kannst sie jetzt ergänzen oder den
                    Entwurf später vervollständigen.
                </p>
            )}
            <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => append(creationRow(definition, getValues()))}
            >
                <Plus />
                {definition.singular} hinzufügen
            </Button>
        </section>
    );
}
