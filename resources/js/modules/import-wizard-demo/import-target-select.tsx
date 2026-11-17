"use client";

import {
    Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { targetOptions, type ImportTarget } from "./model";

/**
 * ReUI Nova c-select-16: two-line options, title-only selected value.
 * Preserves the wizard's string ImportTarget API while using the ReUI
 * Base UI Select primitive's object-valued item rendering.
 */
export function ImportTargetSelect({
    value,
    onValueChange,
}: {
    value: ImportTarget;
    onValueChange: (value: ImportTarget) => void;
}) {
    const selected = targetOptions.find((option) => option.value === value) ?? targetOptions[0];

    return (
        <Select items={targetOptions} value={selected} onValueChange={(next) => {
            if (next) onValueChange(next.value);
        }}>
            <SelectTrigger id="reui-import-target" className="w-full [&_small]:hidden">
                <SelectValue>
                    {(item: (typeof targetOptions)[number]) => item?.label}
                </SelectValue>
            </SelectTrigger>
            <SelectContent
                alignItemWithTrigger={false}
                side="bottom"
                align="start"
                sideOffset={6}
                className="rounded-lg border border-border shadow-lg"
            >
                <SelectGroup>
                    {targetOptions.map((option) => (
                        <SelectItem
                            key={option.value}
                            value={option}
                            className="rounded-md py-2.5 [&_svg]:text-primary"
                        >
                            <span className="flex min-w-0 flex-col items-start gap-px">
                                <span className="font-medium">{option.label}</span>
                                <small className="text-xs text-muted-foreground">
                                    {option.description}
                                </small>
                            </span>
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}
