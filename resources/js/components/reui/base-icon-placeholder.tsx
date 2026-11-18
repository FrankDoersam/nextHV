import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SVGProps } from "react";

/** ReUI's MIT registry points to a website-only IconPlaceholder.
 * Resolve matching Lucide symbols from NextHV's installed icon library. */
export function IconPlaceholder({
    lucide, tabler: _tabler, hugeicons: _hugeicons,
    phosphor: _phosphor, remixicon: _remixicon, ...props
}: SVGProps<SVGSVGElement> & {
    lucide: string; tabler?: string; hugeicons?: string;
    phosphor?: string; remixicon?: string;
}) {
    const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[lucide]
        ?? LucideIcons.CircleHelpIcon;
    return <Icon {...props} />;
}
