import { MoreHorizontal } from "lucide-react";
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
}: {
    action: ResourceAction;
    reason?: string;
}) {
    const Icon = action.icon;
    return (
        <>
            {Icon && <Icon className="size-4 shrink-0" />}
            <span className="min-w-0">
                <span className="block">{action.label}</span>
                {(reason || action.description) && (
                    <span className="mt-0.5 block max-w-64 text-xs leading-4 font-normal text-muted-foreground">
                        {reason || action.description}
                    </span>
                )}
            </span>
        </>
    );
}
function MenuItems({
    actions,
    context,
}: {
    actions: ResourceAction[];
    context: ActionContext;
}) {
    const workbench = useWorkbench();
    const groups = new Map<string, ResourceAction[]>();
    for (const action of actions.filter((action) =>
        actionVisible(action, context),
    )) {
        const key = action.group ?? "";
        groups.set(key, [...(groups.get(key) ?? []), action]);
    }
    return Array.from(groups, ([group, items], index) => (
        <DropdownMenuGroup key={group}>
            {index > 0 && <DropdownMenuSeparator />}
            {group && <DropdownMenuLabel>{group}</DropdownMenuLabel>}
            {items.map((action) => {
                const availability = actionAvailability(action, context);
                const caption = (
                    <Caption
                        action={action}
                        reason={
                            typeof availability === "string"
                                ? availability
                                : undefined
                        }
                    />
                );
                return action.children.length ? (
                    <DropdownMenuSub key={action.id}>
                        <DropdownMenuSubTrigger
                            disabled={availability !== true}
                        >
                            {caption}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-72">
                            <MenuItems
                                actions={action.children}
                                context={context}
                            />
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                ) : (
                    <DropdownMenuItem
                        key={action.id}
                        disabled={availability !== true}
                        variant={action.destructive ? "destructive" : "default"}
                        onClick={(event) => {
                            event.stopPropagation();
                            workbench.runAction(action, context);
                        }}
                    >
                        {caption}
                    </DropdownMenuItem>
                );
            })}
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
}: {
    actions: ResourceAction[];
    target: ActionTarget;
    placement: ActionPlacement;
    label?: string;
    exclude?: string[];
    allowed?: false | string[];
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
            <DropdownMenuContent align="end" className="w-72">
                <MenuItems actions={visible} context={context} />
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
}: {
    actions: ResourceAction[];
    target: ActionTarget;
    placement: ActionPlacement;
    iconOnly?: boolean;
    disabled?: boolean;
    inverse?: boolean;
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
            const Icon = action.icon;
            const button = (
                <Button
                    key={action.id}
                    type="button"
                    variant={inverse ? "secondary" : "ghost"}
                    size={iconOnly ? "icon-xs" : "sm"}
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
                    {Icon ? <Icon /> : iconOnly ? <MoreHorizontal /> : null}
                    {!iconOnly && action.label}
                </Button>
            );
            return action.children.length ? (
                <DropdownMenu key={action.id}>
                    <DropdownMenuTrigger render={button}>
                        {Icon ? <Icon /> : iconOnly ? <MoreHorizontal /> : null}
                        {!iconOnly && action.label}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                        <MenuItems
                            actions={action.children}
                            context={context}
                        />
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                button
            );
        });
}
