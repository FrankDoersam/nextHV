import {
    createContext,
    useContext,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    useNavigate,
    useLocation,
    UNSAFE_DataRouterContext,
} from "react-router";
import { toast } from "sonner";
import type { ResourceAction } from "./actions";
import { useReload } from "./data/hooks";
import { can } from "./permissions";
import { readPanels, panelSearch, type PanelLink } from "./navigation/panels";
import { NavigationGuard } from "./navigation/navigation-guard";
import { FormLayer } from "./forms/form-layer";
import { ActionDialog } from "./forms/action-dialog";
import {
    actionResult,
    ActionResultOverlay,
    type ActionUIResult,
} from "./action-results";
import type {
    ActionContext,
    FormRequest,
    Presentation,
    ResourceInstance,
} from "./types";
interface Workbench {
    openForm: (request: FormRequest) => void;
    runAction: (
        action: ResourceAction,
        context: Omit<ActionContext, "values" | "instance"> & {
            instance?: Partial<ResourceInstance>;
        },
    ) => void;
    presentation: Presentation;
    setPresentation: (value: Presentation) => void;
}
const Context = createContext<Workbench | null>(null);
export function useWorkbench() {
    const value = useContext(Context);
    if (!value) throw new Error("WorkbenchProvider fehlt.");
    return value;
}
export function WorkbenchProvider({ children }: { children: ReactNode }) {
    const location = useLocation();
    const navigate = useNavigate();
    const reload = useReload();
    const panels = readPanels(location.search);
    const cached = useRef(new Map<string, FormRequest>());
    const dirty = useRef(new Map<string, boolean>());
    const [action, setAction] = useState<{
        definition: ResourceAction;
        context: ActionContext;
    } | null>(null);
    const [result, setResult] =
        useState<Exclude<ActionUIResult, { type: "form-patch" }>>();
    const [presentation, setPresentation] = useState<Presentation>("sheet");
    const dataRouter = useContext(UNSAFE_DataRouterContext);
    const openForm = (request: FormRequest) => {
        if (panels.length >= 8) {
            toast.error("Bitte schließe zunächst ein Formular.");
            return;
        }
        const key = crypto.randomUUID();
        cached.current.set(key, request);
        const descriptor: PanelLink = {
            key,
            resource: request.resource.name,
            mode: request.mode,
            id: request.row?.id,
            presentation: request.presentation ?? presentation,
            wizard: request.wizard,
            reduced: request.reduced,
            context: request.context,
        };
        navigate({
            search: panelSearch(location.search, [...panels, descriptor]),
        });
    };
    const closeAt = (index: number) => {
        panels.slice(index).forEach((p) => dirty.current.delete(p.key));
        navigate(
            { search: panelSearch(location.search, panels.slice(0, index)) },
            { replace: true },
        );
    };
    const runAction: Workbench["runAction"] = (definition, context) => {
        if (
            !context.rows.length ||
            (!definition.bulk && context.rows.length !== 1) ||
            !context.rows.every(
                (row) =>
                    definition.visible(row) &&
                    can(context.resource.name, definition.id, row),
            )
        )
            return;
        const instance: ResourceInstance = {
            reload,
            openForm,
            navigate,
            ...context.instance,
        };
        const fullContext = { ...context, instance, values: {} };
        if (definition.id === "edit") {
            void definition.execute(fullContext);
            return;
        }
        setAction({ definition, context: fullContext });
    };
    const completed = (response: unknown, context: ActionContext) => {
        const ui = actionResult(response);
        if (ui?.type === "form-patch") {
            if (!context.instance.form)
                throw new Error(
                    "Diese Action benötigt ein geöffnetes Formular.",
                );
            for (const field of (
                context.instance.formResource ?? context.resource
            ).fields)
                if (
                    !field.readonlyOnEdit &&
                    Object.hasOwn(ui.values, field.name)
                )
                    context.instance.form.setValue(
                        field.name,
                        ui.values[field.name],
                        { shouldDirty: true, shouldValidate: true },
                    );
            if (ui.message) toast.success(ui.message);
        } else if (ui) setResult(ui);
        const native = (
            response as {
                data?: { result?: { type?: string; message?: string } };
            }
        )?.data?.result;
        if (native?.type === "danger")
            throw new Error(native.message ?? "Die Action wurde abgebrochen.");
        if (native?.type === "message" && native.message)
            toast.success(native.message);
    };
    const tail = action ? (
        <ActionDialog
            key={
                action.definition.id +
                action.context.rows.map((r) => r.id).join("-")
            }
            action={action.definition}
            context={action.context}
            onClose={() => setAction(null)}
            onComplete={(r) => completed(r, action.context)}
        />
    ) : result ? (
        <ActionResultOverlay
            result={result}
            onClose={() => setResult(undefined)}
        />
    ) : undefined;
    const layer = (index: number): ReactNode => {
        const panel = panels[index];
        if (!panel) return tail;
        return (
            <FormLayer
                key={panel.key}
                panel={panel}
                cached={cached.current.get(panel.key)}
                onClose={() => closeAt(index)}
                onDirtyChange={(value) => dirty.current.set(panel.key, value)}
                stacked={index < panels.length - 1 || !!tail}
                nested={layer(index + 1)}
            />
        );
    };
    return (
        <Context.Provider
            value={{ openForm, runAction, presentation, setPresentation }}
        >
            {children}
            {layer(0)}
            {dataRouter && <NavigationGuard dirty={dirty} />}
        </Context.Provider>
    );
}
