import { ResourceAction } from "@/framework/actions";
import { dataProvider } from "@/framework/data/provider";
import type { ActionContext, FieldDefinition } from "@/framework/types";

interface CloneRelationOption {
    name: string;
    label: string;
    default?: boolean;
}
interface CloneOptions {
    nameField?: string;
    relations?: CloneRelationOption[];
}

export class CloneAction extends ResourceAction {
    id = "clone";
    label = "Duplizieren";
    location = "row" as const;
    fields: FieldDefinition[];

    constructor(config: boolean | CloneOptions = false) {
        super();
        const options: CloneOptions =
            typeof config === "boolean"
                ? {
                      relations: config
                          ? [
                                {
                                    name: "units",
                                    label: "Einheiten mitkopieren (ohne Verträge)",
                                    default: true,
                                },
                            ]
                          : [],
                  }
                : config;
        const nameField = options.nameField ?? "name";
        this.fields = [
            { name: "code", label: "Neue Nummer", required: true, maxLength: 40 },
            {
                name: nameField,
                label: "Neue Bezeichnung",
                required: true,
                maxLength: 160,
            },
            ...(options.relations ?? []).map(
                (relation): FieldDefinition => ({
                    name: `with_${relation.name}`,
                    label: relation.label,
                    kind: "checkbox",
                    default: relation.default ?? false,
                }),
            ),
        ];
    }

    async execute(
        { rows, resource, values }: ActionContext,
        confirmation?: string,
    ) {
        return dataProvider.action(
            resource.name,
            this.id,
            rows,
            values,
            confirmation,
        );
    }
}
