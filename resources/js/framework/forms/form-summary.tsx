import { useWatch, useFormContext } from "react-hook-form";
import { KeyValueCard } from "@/components/blocks/key-value-card";
import type { FormSummaryDefinition, RecordData, Values } from "../types";

/** Read-only presentation of current values; persistence and validation stay server-side. */
export function FormSummary({
    definition,
    record,
}: {
    definition: FormSummaryDefinition;
    record?: RecordData;
}) {
    const { control } = useFormContext<Values>();
    const values = useWatch({ control });
    return (
        <KeyValueCard
            title={definition.title}
            description={definition.description}
            variant={definition.variant}
            items={definition.items(values, record)}
        />
    );
}
