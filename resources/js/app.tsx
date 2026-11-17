import { I18nProvider } from "@/framework/i18n";
import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/framework/auth";
import { Loading } from "@/components/blocks/content";
import {
    ErrorBoundary,
    RouteErrorFallback,
} from "@/components/blocks/error-boundary";
import { shouldReloadAfterChunkError } from "@/framework/chunk-recovery";
import "@/../css/app.css";
const Application = lazy(() => import("@/framework/application"));
// Global Nova visual variant from the ReUI HTML reference.
document.documentElement.classList.add("style-nova");

// A browser tab can keep an old entry point after a new Vite build replaces its chunks.
window.addEventListener("vite:preloadError", (event) => {
    const error = (event as Event & { payload?: unknown }).payload;
    if (shouldReloadAfterChunkError(error)) {
        event.preventDefault();
        window.location.reload();
    }
});
const client = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});
const router = createBrowserRouter([
    {
        path: "*",
        errorElement: <RouteErrorFallback />,
        element: (
            <QueryClientProvider client={client}>
                <AuthProvider>
                    <Suspense fallback={<Loading />}>
                        <Application />
                    </Suspense>
                </AuthProvider>
            </QueryClientProvider>
        ),
    },
]);
createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <I18nProvider>
            <ErrorBoundary>
                <RouterProvider router={router} />
            </ErrorBoundary>
        </I18nProvider>
    </React.StrictMode>,
);
