import { MapPin, Sparkles, WandSparkles } from "lucide-react";
import {
    ActionGroup,
    ResourceAction,
    type ActionPlacement,
} from "@/framework/actions";
import type { ActionContext } from "@/framework/types";
class CleanPropertyName extends ResourceAction {
    id = "clean-name";
    label = "Leerzeichen bereinigen";
    description = "Übernimmt den bereinigten Namen in das aktuelle Formular.";
    icon = Sparkles;
    requiresRecord = false;
    refresh = false;
    interaction = "immediate" as const;
    enabled({ instance }: ActionContext) {
        return (
            !!String(instance.form?.getValues("name") ?? "").trim() ||
            "Bitte zuerst eine Bezeichnung eingeben."
        );
    }
    async execute({ instance }: ActionContext) {
        const name = String(instance.form!.getValues("name") ?? "")
            .trim()
            .replace(/\s+/g, " ");
        return {
            data: {
                result: {
                    data: {
                        ui: {
                            type: "form-patch",
                            values: { name },
                            message: "Bezeichnung im Formular bereinigt.",
                        },
                    },
                },
            },
        };
    }
}
class PropertyNameFromAddress extends ResourceAction {
    id = "name-from-address";
    label = "Adresse übernehmen";
    description = "Liest Straße und Hausnummer direkt aus diesem Formular.";
    icon = MapPin;
    requiresRecord = false;
    refresh = false;
    interaction = "immediate" as const;
    enabled({ instance }: ActionContext) {
        return (
            !!instance.form?.getValues("street") ||
            "Bitte zuerst eine Straße erfassen."
        );
    }
    async execute({ instance }: ActionContext) {
        const { street, house_number } = instance.form!.getValues();
        return {
            data: {
                result: {
                    data: {
                        ui: {
                            type: "form-patch",
                            values: {
                                name: [street, house_number]
                                    .filter(Boolean)
                                    .join(" "),
                            },
                        },
                    },
                },
            },
        };
    }
}
export class PropertyNameActions extends ActionGroup {
    placements: ActionPlacement[] = ["field"];
    constructor() {
        super(
            "property-name-tools",
            "Bezeichnung aufbereiten",
            [new CleanPropertyName(), new PropertyNameFromAddress()],
            WandSparkles,
        );
    }
}
