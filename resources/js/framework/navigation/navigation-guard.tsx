import type { MutableRefObject } from "react";
import { useBlocker } from "react-router";
import { Overlay } from "@/components/blocks/overlay";
import { Button } from "@/components/ui/button";
import { readPanels } from "./panels";
export function NavigationGuard({
    dirty,
}: {
    dirty: MutableRefObject<Map<string, boolean>>;
}) {
    const blocker = useBlocker(({ currentLocation, nextLocation }) => {
        const next = new Map(
            readPanels(nextLocation.search).map((p) => [p.key, p]),
        );
        return readPanels(currentLocation.search).some(
            (p) =>
                dirty.current.get(p.key) &&
                (currentLocation.pathname !== nextLocation.pathname ||
                    !next.has(p.key) ||
                    next.get(p.key)?.resource !== p.resource ||
                    next.get(p.key)?.id !== p.id ||
                    next.get(p.key)?.flow?.step !== p.flow?.step ||
                    JSON.stringify(next.get(p.key)?.context) !==
                        JSON.stringify(p.context)),
        );
    });
    if (blocker.state !== "blocked") return null;
    return (
        <Overlay
            open
            presentation="dialog"
            size="compact"
            title="Änderungen verwerfen?"
            description="Du hast ungespeicherte Eingaben."
            onClose={() => blocker.reset()}
            footer={
                <>
                    <Button variant="outline" onClick={() => blocker.reset()}>
                        Weiter bearbeiten
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            dirty.current.clear();
                            blocker.proceed();
                        }}
                    >
                        Verwerfen und verlassen
                    </Button>
                </>
            }
        >
            <p className="text-sm leading-6">
                Beim Verlassen gehen diese Eingaben verloren. Bereits
                gespeicherte Datensätze bleiben erhalten.
            </p>
        </Overlay>
    );
}
