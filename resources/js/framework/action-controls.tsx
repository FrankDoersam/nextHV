import { Circle, MoreHorizontal } from "lucide-react";
import { useId } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    actionAt,
    actionAvailability,
    actionVisible,
    type ActionPlacement,
    type ResourceAction,
} from "./actions";
import { useReload } from "./data/hooks";
import type { ActionContext, ResourceInstance } from "./types";
import { useWorkbench } from "./workbench";

export type ActionTarget = Pick<ActionContext, "resource" | "rows"> & {
    instance?: Partial<ResourceInstance>;
};
export function useActionContext(target: ActionTarget): ActionContext {
    const workbench = useWorkbench();
    const reload = useReload();
    const navigate = useNavigate();
    return {
        ...target,
        values: {},
        instance: { ...workbench, reload, navigate, ...target.instance },
    };
}
function Caption({
    action,
    reason,
    descriptionId,
    icons,
}: {
    action: ResourceAction;
    reason?: string;
    descriptionId: string;
    icons: boolean;
}) {
    const Icon = action.icon ?? Circle;
    return (
        <span className="flex min-w-0 flex-1 items-start gap-2.5">
            {icons && (
                <span
                    aria-hidden
                    className="flex size-5 shrink-0 items-center justify-center text-current"
                >
                    <Icon className="size-4" />
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="block text-sm leading-5 font-medium whitespace-normal">
                    {action.label}
                </span>
                {(reason || action.description) && (
                    <span
                        id={descriptionId}
                        className="mt-0.5 block text-xs leading-4 font-normal whitespace-normal text-muted-foreground"
                    >
                        {reason || action.description}
                    </span>
                )}
            </span>
        </span>
    );
}
const menuClass = "w-64 max-w-[calc(100vw-2rem)] p-1.5";
function MenuAction({
    action,
    context,
    icons,
}: {
    action: ResourceAction;
    context: ActionContext;
    icons: boolean;
}) {
    const workbench = useWorkbench();
    const descriptionId = useId();
    const availability = actionAvailability(action, context);
    const reason = typeof availability === "string" ? availability : undefined;
    const caption = (
        <Caption
            action={action}
            reason={reason}
            descriptionId={descriptionId}
            icons={icons}
        />
    );
    const props = {
        className:
            "min-h-9 items-start gap-2 rounded-md px-2 py-2 data-disabled:pointer-events-none data-disabled:opacity-50",
        disabled: availability !== true,
        "aria-label": action.label,
        "aria-describedby":
            reason || action.description ? descriptionId : undefined,
    };
    return action.children.length ? (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger
                {...props}
                className={`${props.className} [&>svg]:mt-0.5`}
            >
                {caption}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={menuClass}>
                <MenuItems
                    actions={action.children}
                    context={context}
                    icons={icons}
                />
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    ) : (
        <DropdownMenuItem
            {...props}
            variant={action.destructive ? "destructive" : "default"}
            onClick={(event) => {
                event.stopPropagation();
                workbench.runAction(action, context);
            }}
        >
            {caption}
        </DropdownMenuItem>
    );
}
function MenuItems({
    actions,
    context,
    icons,
}: {
    actions: ResourceAction[];
    context: ActionContext;
    icons: boolean;
}) {
    const groups = new Map<string, ResourceAction[]>();
    for (const action of actions.filter((action) =>
        actionVisible(action, context),
    )) {
        const key = action.group ?? "";
        groups.set(key, [...(groups.get(key) ?? []), action]);
    }
    return Array.from(groups, ([group, items], index) => (
        <DropdownMenuGroup key={group}>
            {index > 0 && <DropdownMenuSeparator className="my-1.5" />}
            {group && (
                <DropdownMenuLabel className="px-2 py-1.5">
                    {group}
                </DropdownMenuLabel>
            )}
            {items.map((action) => (
                <MenuAction
                    key={action.id}
                    action={action}
                    context={context}
                    icons={icons}
                />
            ))}
        </DropdownMenuGroup>
    ));
}
export function ActionMenu({
    actions,
    target,
    placement,
    label = "Aktionen",
    exclude = [],
    allowed,
    icons = true,
}: {
    actions: ResourceAction[];
    target: ActionTarget;
    placement: ActionPlacement;
    label?: string;
    exclude?: string[];
    allowed?: false | string[];
    icons?: boolean;
}) {
    const context = useActionContext(target);
    const visible = actions.filter(
        (action) =>
            allowed !== false &&
            (!allowed || allowed.includes(action.id)) &&
            !exclude.includes(action.id) &&
            actionAt(action, placement) &&
            actionVisible(action, context),
    );
    if (!visible.length) return null;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={label}
                        onClick={(e) => e.stopPropagation()}
                    />
                }
            >
                <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={menuClass}>
                <MenuItems actions={visible} context={context} icons={icons} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
export function ActionButtons({
    actions,
    target,
    placement,
    iconOnly = false,
    disabled = false,
    inverse = false,
    icons = true,
}: {
    actions: ResourceAction[];
    target: ActionTarget;
    placement: ActionPlacement;
    iconOnly?: boolean;
    disabled?: boolean;
    inverse?: boolean;
    icons?: boolean;
}) {
    const context = useActionContext(target);
    const workbench = useWorkbench();
    return actions
        .filter(
            (action) =>
                actionAt(action, placement) && actionVisible(action, context),
        )
        .map((action) => {
            const available = actionAvailability(action, context);
            const Icon = action.icon ?? Circle;
            const content = (
                <>
                    {(icons || iconOnly) && <Icon aria-hidden />}
                    {!iconOnly && action.label}
                </>
            );
            const button = (
                <Button
                    key={action.id}
                    type="button"
                    variant={inverse ? "secondary" : "ghost"}
                    size={
                        placement === "table"
                            ? iconOnly
                                ? "icon-lg"
                                : "lg"
                            : iconOnly
                              ? "icon-xs"
                              : "sm"
                    }
                    aria-label={action.label}
                    title={
                        typeof available === "string"
                            ? available
                            : (action.description ?? action.label)
                    }
                    disabled={disabled || available !== true}
                    className={inverse ? "rounded-full" : undefined}
                    onClick={
                        action.children.length
                            ? undefined
                            : () => workbench.runAction(action, context)
                    }
                >
                    {content}
                </Button>
            );
            return action.children.length ? (
                <DropdownMenu key={action.id}>
                    <DropdownMenuTrigger render={button}>
                        {content}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className={menuClass}>
                        <MenuItems
                            actions={action.children}
                            context={context}
                            icons={icons}
                        />
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                button
            );
        });
}
