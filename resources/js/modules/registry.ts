import type { ResourceDefinition } from "@/framework/types";
import { partners } from "./business-partners/partners-resource";
import { roles } from "./business-partners/roles-resource";
import { conditions } from "./contracts/conditions-resource";
import { contracts } from "./contracts/contracts-resource";
import { links } from "./contracts/links-resource";
import { parties } from "./contracts/parties-resource";
import { terminations } from "./contracts/terminations-resource";
import { identities } from "./documents/identities-resource";
import { properties } from "./properties/properties-resource";
import { units } from "./units/units-resource";
export {
    conditions,
    contracts,
    identities,
    links,
    parties,
    partners,
    properties,
    roles,
    terminations,
    units,
};
// Vite discovers every declarative feature module. New resources need no manual UI registry edit.
const modules = import.meta.glob<Record<string, unknown>>("./**/*-resource.ts", {
    eager: true,
});
const discovered = Object.values(modules).flatMap((module) =>
    Object.values(module).filter((value): value is ResourceDefinition => {
        if (typeof value !== "object" || value === null) return false;
        const candidate = value as Partial<ResourceDefinition>;
        return (
            typeof candidate.name === "string" &&
            Array.isArray(candidate.fields) &&
            Array.isArray(candidate.columns)
        );
    }),
);
const preferredOrder = [
    "properties",
    "units",
    "business-partners",
    "contracts",
    "termination-notices",
    "rent-conditions",
    "identity-documents",
    "partner-roles",
    "contract-parties",
    "contract-links",
];
export const resources: ResourceDefinition[] = discovered.sort((a, b) => {
    const ai = preferredOrder.indexOf(a.name);
    const bi = preferredOrder.indexOf(b.name);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.name.localeCompare(b.name);
});
if (new Set(resources.map((resource) => resource.name)).size !== resources.length) {
    throw new Error("Doppelte CRUD-Ressourcenregistrierung.");
}

export function getResource(name: string) {
    const resource = resources.find((r) => r.name === name);
    if (!resource) throw new Error(`Unbekannte Ressource: ${name}`);
    return resource;
}
