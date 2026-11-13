import type { FormFlowDefinition } from "@/framework/forms/flow";
export const contractFlow: FormFlowDefinition = {
    id: "new-contract",
    label: "Neuen Mietvertrag vorbereiten",
    steps: [
        {
            id: "contract",
            label: "Vertrag",
            resource: "contracts",
            binding: { field: "unit_id", source: "parent", resource: "units" },
        },
        {
            id: "tenant",
            label: "Mieter zuordnen",
            resource: "contract-parties",
            binding: {
                field: "contract_id",
                source: "contract",
                resource: "contracts",
            },
        },
        {
            id: "condition",
            label: "Erste Kondition",
            resource: "rent-conditions",
            binding: {
                field: "contract_id",
                source: "contract",
                resource: "contracts",
            },
        },
    ],
    completion: { navigateTo: "contract" },
};
