import type { LucideIcon } from "lucide-react";
import { House } from "lucide-react";
import type { ResourceDefinition } from "../types";
import { access, type PermissionDecision } from "../permissions";

export interface NavigationContext {
    user?: { id?: number; name: string; email: string };
    can: (resource: string, action: string) => boolean;
}

export type NavigationPredicate =
    | boolean
    | ((context: NavigationContext) => boolean);
export type NavigationEnabled =
    | boolean
    | string
    | ((context: NavigationContext) => boolean | string);

export interface NavigationItemDefinition {
    id: string;
    label: string;
    icon?: LucideIcon;
    resource?: string;
    view?: string;
    to?: string;
    description?: string;
    tooltip?: string;
    badge?: string;
    count?: boolean;
    defaultOpen?: boolean;
    visible?: NavigationPredicate;
    enabled?: NavigationEnabled;
    permission?: {
        resource?: string;
        action?: string;
        denied?: "hide" | "disable";
    };
    children?: NavigationItemDefinition[];
}

export interface NavigationItem extends Omit<
    NavigationItemDefinition,
    "resource" | "children" | "visible" | "enabled" | "permission"
> {
    resource?: ResourceDefinition;
    to?: string;
    disabledReason?: string;
    children: NavigationItem[];
}

const valid = (
    condition: NavigationPredicate | undefined,
    context: NavigationContext,
) => typeof condition === "function" ? condition(context) : condition !== false;

/** Keep the existing resource registry as the source of truth; declarations only enrich its navigation. */
export function defaultNavigation(resources: ResourceDefinition[]): NavigationItemDefinition[] {
    const groups = new Map<string, NavigationItemDefinition[]>();
    for (const resource of resources) {
        if (resource.navigation === false) continue;
        const group = resource.navigationGroup ?? "Verwaltung";
        if (!groups.has(group)) groups.set(group, []);
        const options = resource.navigationItem;
        groups.get(group)!.push({
            id: resource.name,
            label: resource.label,
            icon: resource.icon,
            resource: resource.name,
            description: options?.description,
            tooltip: options?.tooltip,
            badge: options?.badge,
            defaultOpen: options?.defaultOpen,
            visible: options?.visible,
            enabled: options?.enabled,
            permission: options?.permission,
            children: options?.children,
        });
    }
    return [
        { id: "home", label: "Übersicht", icon: House, to: "/" },
        ...[...groups].map(([group, children]) => ({
            id: `group:${group}`,
            label: group,
            description: group === "Stammdaten"
                ? "Objekte, Einheiten und Geschäftspartner"
                : undefined,
            defaultOpen: true,
            children,
        })),
    ];
}

function evaluateEnabled(
    condition: NavigationEnabled | undefined,
    context: NavigationContext,
): string | undefined {
    const value = typeof condition === "function" ? condition(context) : condition;
    return typeof value === "string"
        ? value || "Nicht verfügbar"
        : value === false
          ? "Derzeit nicht verfügbar"
          : undefined;
}

/** Resolve once for the sidebar and command palette, so hidden/forbidden entries never leak into either surface. */
export function resolveNavigation(
    definitions: NavigationItemDefinition[],
    resources: ResourceDefinition[],
    user?: NavigationContext["user"],
    decide: (resource: string, action: string) => PermissionDecision = access,
): NavigationItem[] {
    const byName = new Map(resources.map((resource) => [resource.name, resource]));
    const context: NavigationContext = {
        user,
        can: (resource, action) => {
            const decision = decide(resource, action);
            return typeof decision === "boolean" ? decision : decision.allowed;
        },
    };
    const resolve = (
        definition: NavigationItemDefinition,
        inheritedResource?: ResourceDefinition,
        parentDisabled?: string,
    ): NavigationItem | null => {
        if (!valid(definition.visible, context)) return null;
        const resource = definition.resource
            ? byName.get(definition.resource)
            : inheritedResource;
        if (definition.resource && !resource) return null;
        const permissionResource = definition.permission?.resource ?? resource?.name;
        const allowed = permissionResource
            ? decide(permissionResource, definition.permission?.action ?? "list")
            : true;
        const permitted = typeof allowed === "boolean" ? allowed : allowed.allowed;
        const denialReason = typeof allowed === "boolean" ? undefined : allowed.reason;
        if (!permitted && definition.permission?.denied !== "disable") return null;
        const disabledReason =
            parentDisabled ??
            (!permitted ? denialReason || "Keine Berechtigung" : undefined) ??
            evaluateEnabled(definition.enabled, context);
        const view = definition.view && resource?.views?.find(
            (candidate) => candidate.id === definition.view,
        );
        // A stale view declaration must never silently navigate to unfiltered data.
        if (definition.view && !view) return null;
        const children = (definition.children ?? [])
            .map((child) => resolve(child, resource, disabledReason))
            .filter((child): child is NavigationItem => child !== null);
        const to = definition.to ??
            (resource
                ? `/${resource.name}${view ? `?view=${encodeURIComponent(view.id)}` : ""}`
                : undefined);
        if (!to && children.length === 0) return null;
        return {
            ...definition,
            resource,
            to,
            children,
            disabledReason,
        };
    };
    return definitions
        .map((definition) => resolve(definition))
        .filter((definition): definition is NavigationItem => definition !== null);
}

export function flattenNavigation(items: NavigationItem[]): NavigationItem[] {
    return items.flatMap((item) => [item, ...flattenNavigation(item.children)]);
}

/** Exact view match for filtered sidebar leaves; detail pages activate their resource branch. */
export function navigationSelected(
    item: NavigationItem,
    pathname: string,
    search: string,
): boolean {
    if (!item.to) return false;
    const target = new URL(item.to, "https://nexthv.local");
    if (target.pathname !== pathname) {
        return !item.view && item.resource !== undefined &&
            pathname.startsWith(`/${item.resource.name}/`);
    }
    const current = new URLSearchParams(search).get("view");
    if (item.view) return current === item.view;
    if (item.resource?.views?.length) {
        return !current || current === item.resource.views[0].id;
    }
    return true;
}

export function navigationBranchActive(
    item: NavigationItem,
    pathname: string,
    search: string,
): boolean {
    return navigationSelected(item, pathname, search) ||
        item.children.some((child) => navigationBranchActive(child, pathname, search));
}

/** Matched leaf plus its ancestors for context-aware breadcrumbs. */
export function navigationPath(
    items: NavigationItem[],
    pathname: string,
    search: string,
): NavigationItem[] {
    for (const item of items) {
        const childPath = navigationPath(item.children, pathname, search);
        if (childPath.length) return [item, ...childPath];
        if (navigationSelected(item, pathname, search)) return [item];
    }
    return [];
}
