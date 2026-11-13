import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router";
import { useAuth } from "@/framework/auth";
import { WorkbenchProvider } from "@/framework/workbench";
import { resources } from "@/modules/registry";
import { AppShell } from "@/components/blocks/layout";
import { Loading, EmptyState } from "@/components/blocks/content";
import { ErrorBoundary } from "@/components/blocks/error-boundary";
const Dashboard = lazy(() => import("@/pages/dashboard-page"));
const ResourcePage = lazy(() => import("@/pages/resource-page"));
const ContractDetailPage = lazy(() => import("@/pages/contract-detail-page"));
const DetailPage = lazy(() => import("@/pages/detail-page"));
const ComponentsPage = lazy(() => import("@/pages/components-page"));
export default function Application() {
    const { user, logout } = useAuth();
    return (
        <WorkbenchProvider>
            <AppShell
                resources={resources}
                user={user}
                onLogout={() =>
                    logout().catch((e) =>
                        import("sonner").then(({ toast }) =>
                            toast.error(e.message),
                        ),
                    )
                }
            >
                <ErrorBoundary>
                    <Suspense fallback={<Loading />}>
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            {resources.map((r) => (
                                <React.Fragment key={r.name}>
                                    <Route
                                        path={`/${r.name}`}
                                        element={
                                            <ResourcePage
                                                key={r.name}
                                                resource={r}
                                            />
                                        }
                                    />
                                    <Route
                                        path={`/${r.name}/:id`}
                                        element={
                                            r.name === "contracts" ? (
                                                <ContractDetailPage />
                                            ) : (
                                                <DetailPage
                                                    key={r.name}
                                                    resource={r}
                                                />
                                            )
                                        }
                                    />
                                </React.Fragment>
                            ))}
                            <Route
                                path="/components"
                                element={<ComponentsPage />}
                            />
                            <Route
                                path="*"
                                element={
                                    <EmptyState
                                        title="Seite nicht gefunden"
                                        description="Wähle einen Bereich aus der Navigation."
                                    />
                                }
                            />
                        </Routes>
                    </Suspense>
                </ErrorBoundary>
            </AppShell>
        </WorkbenchProvider>
    );
}
