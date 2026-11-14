import { Component, useEffect, type ReactNode } from "react";
import { useRouteError } from "react-router";
import { isChunkLoadError, shouldReloadAfterChunkError } from "@/framework/chunk-recovery";
import { ErrorState } from "./content";

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: (error: Error) => ReactNode;
    resetKey?: string;
}

export class ErrorBoundary extends Component<
    ErrorBoundaryProps,
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidUpdate(previous: ErrorBoundaryProps) {
        if (
            previous.resetKey !== this.props.resetKey &&
            this.state.error !== null
        )
            this.setState({ error: null });
    }

    render() {
        if (this.state.error)
            return this.props.fallback ? (
                this.props.fallback(this.state.error)
            ) : (
                <ErrorState
                    error={this.state.error}
                    retry={() => window.location.reload()}
                />
            );
        return this.props.children;
    }
}

export function RouteErrorFallback() {
    const error = useRouteError();
    const missingChunk = isChunkLoadError(error);

    useEffect(() => {
        if (shouldReloadAfterChunkError(error)) window.location.reload();
    }, [error]);

    return (
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-12">
            <h1 className="text-xl font-semibold">
                Die Anwendung konnte nicht geladen werden
            </h1>
            <ErrorState
                error={
                    missingChunk
                        ? new Error(
                              "Eine Anwendungsdatei fehlt oder ist veraltet. Bitte lade die Seite neu. Bleibt der Fehler bestehen, muss der Frontend-Build erneut erstellt werden.",
                          )
                        : error
                }
                retry={() => window.location.reload()}
            />
        </main>
    );
}
