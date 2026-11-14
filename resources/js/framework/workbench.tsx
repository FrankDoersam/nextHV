import {
    createContext,
    lazy,
    Suspense,
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
import { actionAvailability, type ResourceAction } from "./actions";
import { useReload } from "./data/hooks";
import { readPanels, panelSearch, type PanelLink } from "./navigation/panels";
import { NavigationGuard } from "./navigation/navigation-guard";
import { advanceFlow, flowPanel, type RecordReference } from "./forms/flow";
import { getFlow } from "@/modules/flows";
import { getResource } from "@/modules/registry";
const FormLayer = lazy(() =>
    import("./forms/form-layer").then((m) => ({ default: m.FormLayer })),
);
const ActionDialog = lazy(() =>
    import("./forms/action-dialog").then((m) => ({ default: m.ActionDialog })),
);
import { Loading } from "@/components/blocks/content";
import { Overlay } from "@/components/blocks/overlay";
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
    RelationDefinition,
    RecordData,
} from "./types";
interface Workbench {
    openForm: (request: FormRequest) => void;
    openFlow: (
        id: string,
        options?: { parent?: RecordReference; presentation?: Presentation },
    ) => void;
    openRelation: (
        relation: RelationDefinition,
        parent: RecordReference,
        row?: RecordData,
    ) => void;
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
        panels.slice(index).forEach((p) => {
            dirty.current.delete(p.key);
            cached.current.delete(p.key);
        });
        navigate(
            { search: panelSearch(location.search, panels.slice(0, index)) },
            { replace: true },
        );
    };
    const openFlow: Workbench["openFlow"] = (id, options) => {
        if (panels.length >= 8) {
            toast.error("Bitte schließe zunächst ein Formular.");
            return;
        }
        const panel = flowPanel(
            getFlow(id),
            { id, step: 0, records: {}, parent: options?.parent },
            crypto.randomUUID(),
            options?.presentation ?? presentation,
        );
        navigate({ search: panelSearch(location.search, [...panels, panel]) });
    };
    const moveFlow = (index: number, state: NonNullable<PanelLink["flow"]>) => {
        const current = panels[index];
        dirty.current.delete(current.key);
        cached.current.delete(current.key);
        const next = flowPanel(
            getFlow(state.id),
            state,
            current.key,
            current.presentation,
        );
        navigate(
            {
                search: panelSearch(location.search, [
                    ...panels.slice(0, index),
                    next,
                ]),
            },
            { replace: true },
        );
    };
    const openRelation: Workbench["openRelation"] = (relation, parent, row) => {
        const resource = getResource(relation.resource);
        const options = row ? relation.editForm : relation.createForm;
        const flow = !row && (relation.createForm?.flow ?? resource.createFlow);
        if (flow) {
            openFlow(flow, { parent, presentation: options?.presentation });
            return;
        }
        openForm({
            resource,
            mode: row ? "edit" : "create",
            row,
            ...options,
            context:
                options?.binding === "none"
                    ? undefined
                    : {
                          ...parent,
                          field: relation.field,
                          mode:
                              options?.binding === "prefill"
                                  ? "prefill"
                                  : "locked",
                      },
        });
    };
    const immediateRunning = useRef(false);
    const runAction: Workbench["runAction"] = (definition, context) => {
        const instance: ResourceInstance = {
            reload,
            openForm,
            openFlow,
            openRelation,
            navigate,
            ...context.instance,
        };
        const fullContext = { ...context, instance, values: {} };
        const availability = actionAvailability(definition, fullContext);
        if (availability !== true || definition.children.length) {
            if (typeof availability === "string") toast.error(availability);
            return;
        }
        if (definition.interaction === "immediate") {
            if (immediateRunning.current) return;
            immediateRunning.current = true;
            void (async () => {
                try {
                    completed(
                        await definition.execute(fullContext),
                        fullContext,
                    );
                    if (definition.refresh) {
                        await instance.reload();
                        await instance.refreshForm?.();
                    }
                } catch (error) {
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : "Die Action ist fehlgeschlagen.",
                    );
                } finally {
                    immediateRunning.current = false;
                }
            })();
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
                key={`${panel.key}:${panel.flow?.step ?? "form"}`}
                panel={panel}
                cached={cached.current.get(panel.key)}
                onClose={() => closeAt(index)}
                onDirtyChange={(value) => dirty.current.set(panel.key, value)}
                stacked={index < panels.length - 1 || !!tail}
                nested={layer(index + 1)}
                flow={
                    panel.flow
                        ? {
                              label: getFlow(panel.flow.id).label,
                              steps: getFlow(panel.flow.id).steps.map(
                                  (s) => s.label,
                              ),
                              index: panel.flow.step,
                              onBack:
                                  panel.flow.step > 0
                                      ? () =>
                                            moveFlow(index, {
                                                ...panel.flow!,
                                                step: panel.flow!.step - 1,
                                            })
                                      : undefined,
                              onSaved: (row) => {
                                  const definition = getFlow(panel.flow!.id);
                                  const next = advanceFlow(
                                      definition,
                                      panel.flow!,
                                      row,
                                  );
                                  dirty.current.delete(panel.key);
                                  if (next.step < definition.steps.length)
                                      moveFlow(index, next);
                                  else {
                                      const target = definition.completion
                                          ? next.records[
                                                definition.completion.navigateTo
                                            ]
                                          : undefined;
                                      // Nested flows return to the parent form; root flows may open a detail page.
                                      if (target && index === 0)
                                          navigate(
                                              `/${target.resource}/${target.id}`,
                                              { replace: true },
                                          );
                                      else closeAt(index);
                                  }
                              },
                          }
                        : undefined
                }
            />
        );
    };
    return (
        <Context.Provider
            value={{
                openForm,
                openFlow,
                openRelation,
                runAction,
                presentation,
                setPresentation,
            }}
        >
            {children}
            <Suspense
                fallback={
                    <Overlay
                        open
                        title="Formular wird geladen"
                        onClose={() =>
                            panels.length
                                ? closeAt(panels.length - 1)
                                : setAction(null)
                        }
                        presentation={panels.at(-1)?.presentation ?? "dialog"}
                    >
                        <Loading />
                    </Overlay>
                }
            >
                {layer(0)}
            </Suspense>
            {dataRouter && <NavigationGuard dirty={dirty} />}
        </Context.Provider>
    );
}
