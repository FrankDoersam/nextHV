import { dataProvider } from "./provider";
import type { ResourceDefinition } from "../types";

/** A named adapter must implement the entire contract; reads and writes cannot drift across backends. */
export type ResourceDataProvider = typeof dataProvider;
const providers = new Map<string, ResourceDataProvider>([["default", dataProvider]]);

export function registerDataProvider(name: string, provider: ResourceDataProvider) {
    if (!name || name === "default") {
        throw new Error("Nur benannte zusätzliche Data-Provider können registriert werden.");
    }
    providers.set(name, provider);
}

export function unregisterDataProvider(name: string) {
    if (name !== "default") providers.delete(name);
}

export function resolveDataProvider(resource: Pick<ResourceDefinition, "dataProvider">): ResourceDataProvider {
    const name = resource.dataProvider ?? "default";
    const provider = providers.get(name);
    if (!provider) throw new Error(`Unbekannter Data-Provider: ${name}`);
    return provider;
}
