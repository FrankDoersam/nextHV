import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChoiceOption } from "./choice-picker";

/** The same option anatomy in the popup, rich selection and choice buttons. */
export function ChoiceContent({ option }: { option: ChoiceOption }) {
    return (
        <>
            {option.image ? (
                <Avatar className="size-8 shrink-0 rounded-md">
                    <AvatarImage src={option.image} alt="" />
                    <AvatarFallback className="rounded-md text-xs">
                        {option.label.slice(0, 2)}
                    </AvatarFallback>
                </Avatar>
            ) : option.icon ? (
                <span className="shrink-0 text-muted-foreground [&_svg]:size-4">
                    {option.icon}
                </span>
            ) : null}
            <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">
                    {option.label}
                </span>
                {option.description && (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                        {option.description}
                    </span>
                )}
            </span>
            {option.badge && (
                <Badge
                    variant="secondary"
                    className={cn(
                        "max-w-28 shrink-0 truncate text-[11px]",
                        option.badgeTone === "success" &&
                            "bg-emerald-50 text-emerald-700",
                        option.badgeTone === "warning" &&
                            "bg-amber-50 text-amber-800",
                        option.badgeTone === "danger" &&
                            "bg-red-50 text-red-700",
                    )}
                >
                    {option.badge}
                </Badge>
            )}
        </>
    );
}
