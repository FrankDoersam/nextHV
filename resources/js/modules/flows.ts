import { contractFlow } from "./contracts/contract-flow";
export const flows = [contractFlow];
export function getFlow(id: string) {
    const flow = flows.find(f => f.id === id);
    if (!flow) throw new Error("Dieser Formularablauf ist nicht registriert.");
    return flow;
}
