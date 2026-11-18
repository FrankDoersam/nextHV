import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { Cell } from "@/components/blocks/cell";
import {
    PersonAvatar,
    type AvatarPerson,
} from "@/components/blocks/people-avatar";
import { Rating } from "@/components/reui/rating";
import {
    Avatar,
    AvatarFallback,
    AvatarGroup,
    AvatarGroupCount,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { date as formatDate, money, number } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EnterpriseTone =
    "neutral" | "success" | "warning" | "danger" | "info";

const toneText: Record<EnterpriseTone, string> = {
    neutral: "text-foreground",
    success: "text-success-foreground",
    warning: "text-warning-foreground",
    danger: "text-destructive",
    info: "text-info-foreground",
};

const toneDot: Record<EnterpriseTone, string> = {
    neutral: "bg-muted-foreground",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    info: "bg-info",
};

const toneBadge: Record<EnterpriseTone, string> = {
    neutral: "border-border bg-muted/30 text-muted-foreground",
    success: "border-success/20 bg-success/10 text-success-foreground",
    warning: "border-warning/20 bg-warning/10 text-warning-foreground",
    danger: "border-destructive/20 bg-destructive/10 text-destructive",
    info: "border-info/20 bg-info/10 text-info-foreground",
};

const toneProgress: Record<EnterpriseTone, string> = {
    neutral: "**:data-[slot=progress-indicator]:bg-muted-foreground",
    success: "**:data-[slot=progress-indicator]:bg-success",
    warning: "**:data-[slot=progress-indicator]:bg-warning",
    danger: "**:data-[slot=progress-indicator]:bg-destructive",
    info: "**:data-[slot=progress-indicator]:bg-info",
};

export function EnterpriseEntityCell({
    title,
    subtitle,
    initials,
    icon,
    onClick,
    tags,
}: {
    title: string;
    subtitle?: string;
    initials?: string;
    icon?: ReactNode;
    onClick?: () => void;
    tags?: string[];
}) {
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            {icon ? (
                <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground [&>svg]:size-4"
                >
                    {icon}
                </span>
            ) : (
                <Avatar aria-hidden="true" className="size-8">
                    <AvatarFallback className="bg-info/10 text-xs font-medium text-info-foreground">
                        {initials ??
                            title
                                .trim()
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part.charAt(0))
                                .join("")
                                .toUpperCase()}
                    </AvatarFallback>
                </Avatar>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {onClick ? (
                    <Cell
                        onClick={onClick}
                        title={title}
                        className="truncate text-sm leading-5"
                    >
                        {title}
                    </Cell>
                ) : (
                    <span
                        title={title}
                        className="truncate text-sm leading-5 font-medium text-foreground"
                    >
                        {title}
                    </span>
                )}
                {subtitle && (
                    <span
                        title={subtitle}
                        className="truncate text-xs text-muted-foreground"
                    >
                        {subtitle}
                    </span>
                )}
                {tags && tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                        {tags.map((tag) => (
                            <Badge
                                key={tag}
                                variant="secondary"
                                className="h-4 px-1 text-[10px] font-normal"
                            >
                                {tag}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function EnterprisePersonCell({
    name,
    subtitle,
}: {
    name: string;
    subtitle?: string;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <PersonAvatar
                person={{ id: name, name }}
                size="sm"
                fallbackClassName="bg-info/10 text-[10px] text-info-foreground"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
                <span title={name} className="truncate text-sm text-foreground">
                    {name}
                </span>
                {subtitle && (
                    <span
                        title={subtitle}
                        className="truncate text-xs text-muted-foreground"
                    >
                        {subtitle}
                    </span>
                )}
            </div>
        </div>
    );
}

export function EnterpriseStatusCell({
    label,
    tone = "neutral",
}: {
    label: string;
    tone?: EnterpriseTone;
}) {
    return (
        <Badge
            variant="outline"
            className={cn("max-w-full gap-1.5 px-1.5", toneBadge[tone])}
        >
            <span
                aria-hidden="true"
                className={cn("size-1.5 shrink-0 rounded-full", toneDot[tone])}
            />
            <span className="truncate">{label}</span>
        </Badge>
    );
}

export function EnterpriseProgressCell({
    value,
    label = "Fortschritt",
    variant = "bar",
    tone = "success",
}: {
    value: number;
    label?: string;
    variant?: "bar" | "ring";
    tone?: EnterpriseTone;
}) {
    const percentage = Math.min(
        100,
        Math.max(0, Number.isFinite(value) ? value : 0),
    );
    const formatted = `${number(percentage, 1)} %`;
    const circumference = 2 * Math.PI * 9;

    return (
        <div
            className="flex min-w-0 items-center gap-2"
            title={`${label}: ${formatted}`}
        >
            {variant === "ring" ? (
                <svg
                    viewBox="0 0 24 24"
                    role="progressbar"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percentage}
                    aria-valuetext={formatted}
                    className={cn("size-5 shrink-0", toneText[tone])}
                >
                    <circle
                        cx="12"
                        cy="12"
                        r="9"
                        fill="none"
                        strokeWidth="2.5"
                        className="stroke-border"
                    />
                    <circle
                        cx="12"
                        cy="12"
                        r="9"
                        fill="none"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={
                            circumference * (1 - percentage / 100)
                        }
                        transform="rotate(-90 12 12)"
                        className="stroke-current"
                    />
                </svg>
            ) : (
                <Progress
                    value={percentage}
                    aria-label={label}
                    aria-valuetext={formatted}
                    className={cn(
                        "min-w-12 flex-1 **:data-[slot=progress-track]:h-1.5 **:data-[slot=progress-track]:rounded-full **:data-[slot=progress-track]:bg-muted **:data-[slot=progress-indicator]:rounded-full",
                        toneProgress[tone],
                    )}
                />
            )}
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatted}
            </span>
        </div>
    );
}

export function EnterpriseDateCell({
    date,
    overdue = false,
}: {
    date: string;
    overdue?: boolean;
}) {
    return (
        <Badge
            variant="outline"
            className={cn(
                "gap-1.5 px-1.5 font-normal",
                overdue
                    ? toneBadge.danger
                    : "bg-background text-muted-foreground",
            )}
        >
            <CalendarDays aria-hidden="true" className="size-3.5" />
            <time dateTime={date} title={date} className="tabular-nums">
                {formatDate(date)}
            </time>
            {overdue && <span className="sr-only"> – überfällig</span>}
        </Badge>
    );
}

export function EnterpriseAmountCell({
    value,
    secondary,
    tone = "neutral",
}: {
    value: number;
    secondary?: string;
    tone?: EnterpriseTone;
}) {
    return (
        <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
            <span
                className={cn(
                    "whitespace-nowrap text-sm font-medium tabular-nums",
                    toneText[tone],
                )}
            >
                {Number.isFinite(value) ? money(value) : "—"}
            </span>
            {secondary && (
                <span
                    title={secondary}
                    className="max-w-full truncate text-xs text-muted-foreground"
                >
                    {secondary}
                </span>
            )}
        </div>
    );
}

export function EnterpriseRatingCell({
    value,
    label = "Bewertung",
}: {
    value: number;
    label?: string;
}) {
    const rating = Math.min(5, Math.max(0, Number.isFinite(value) ? value : 0));

    return (
        <div
            role="img"
            aria-label={`${label}: ${number(rating, 1)} von 5`}
            className="flex items-center gap-2"
        >
            <Rating rating={rating} size="sm" aria-hidden="true" />
            <span
                aria-hidden="true"
                className="text-xs text-muted-foreground tabular-nums"
            >
                {number(rating, 1)}
            </span>
        </div>
    );
}

export function EnterpriseAvatarGroup({
    people,
    max = 3,
}: {
    people: AvatarPerson[];
    max?: number;
}) {
    const limit = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 3;
    const remaining = people.slice(limit);

    return (
        <AvatarGroup className="-space-x-1">
            {people.slice(0, limit).map((person) => (
                <PersonAvatar key={person.id} person={person} size="sm" />
            ))}
            {remaining.length > 0 && (
                <AvatarGroupCount className="size-6 text-[10px]">
                    <Popover>
                        <PopoverTrigger
                            aria-label={`${remaining.length} weitere Personen anzeigen`}
                            className="flex size-full items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            +{remaining.length}
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-64 gap-3 p-3"
                            align="start"
                        >
                            <PopoverTitle>Weitere Personen</PopoverTitle>
                            {remaining.map((person) => (
                                <EnterprisePersonCell
                                    key={person.id}
                                    name={person.name}
                                />
                            ))}
                        </PopoverContent>
                    </Popover>
                </AvatarGroupCount>
            )}
        </AvatarGroup>
    );
}
