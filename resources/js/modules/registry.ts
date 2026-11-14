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
export const resources: ResourceDefinition[] = [
    properties,
    units,
    partners,
    contracts,
    terminations,
    conditions,
    identities,
    roles,
    parties,
    links,
];
for (const resource of resources) resource.bulkActions ??= ["delete"];
export function getResource(name: string) {
    const resource = resources.find((r) => r.name === name);
    if (!resource) throw new Error(`Unbekannte Ressource: ${name}`);
    return resource;
}
