import {
    CalendarIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon,
    ChevronRightIcon, CircleHelpIcon, GripVerticalIcon, MinusIcon,
    PlusIcon, RepeatIcon,
} from "lucide-react";
import type { SVGProps } from "react";

/**
 * ReUI's published registry refers to its website-only IconPlaceholder.
 * This small integration adapter renders the same default Lucide icon set
 * without depending on any ReUI website internals.
 */
const icons = {
    CalendarIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon,
    ChevronRightIcon, GripVerticalIcon, MinusIcon, PlusIcon, RepeatIcon,
} as const;

export function IconPlaceholder({
    lucide,
    tabler: _tabler,
    hugeicons: _hugeicons,
    phosphor: _phosphor,
    remixicon: _remixicon,
    ...props
}: SVGProps<SVGSVGElement> & {
    lucide: string;
    tabler?: string;
    hugeicons?: string;
    phosphor?: string;
    remixicon?: string;
}) {
    const Icon = icons[lucide as keyof typeof icons] ?? CircleHelpIcon;
    return <Icon {...props} />;
}
