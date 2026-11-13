import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/framework/auth";
import { Loading } from "@/components/blocks/content";
import { ErrorBoundary } from "@/components/blocks/error-boundary";
import "@/../css/app.css";
const Application = lazy(() => import("@/framework/application"));
const client = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});
createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <BrowserRouter>
                <QueryClientProvider client={client}>
                    <AuthProvider>
                        <Suspense fallback={<Loading />}>
                            <Application />
                        </Suspense>
                    </AuthProvider>
                    <Toaster richColors closeButton position="bottom-right" />
                </QueryClientProvider>
            </BrowserRouter>
        </ErrorBoundary>
    </React.StrictMode>,
);
