import { ResourceSchemaProvider } from "@/framework/data/resource-schema-provider";
import React, { Suspense, lazy, useState } from "react";
import { Routes, Route, useLocation } from "react-router";
import { useAuth } from "@/framework/auth";
import { WorkbenchProvider } from "@/framework/workbench";
import { resources } from "@/modules/registry";
import { navigationGroups } from "@/modules/navigation";
import { AppShell } from "@/components/blocks/layout";
import { CollectionLoading } from "@/components/blocks/collection-loading";
import { Loading, EmptyState, ErrorState } from "@/components/blocks/content";
import { ErrorBoundary } from "@/components/blocks/error-boundary";
const Dashboard = lazy(() => import("@/pages/dashboard-page"));
const ResourcePage = lazy(() => import("@/pages/resource-page"));
const ContractDetailPage = lazy(() => import("@/pages/contract-detail-page"));
const DetailPage = lazy(() => import("@/pages/detail-page"));
const ComponentsPage = lazy(() => import("@/pages/components-page"));
export default function Application() {
    const { user } = useAuth();
    return (
        <ResourceSchemaProvider resources={resources} userId={user.id}>
            <ApplicationWorkspace />
        </ResourceSchemaProvider>
    );
}
function ApplicationWorkspace() {
    const location = useLocation();
    const loadingResource = resources.find(
        (resource) => location.pathname === "/" + resource.name,
    );
    const { user, logout } = useAuth();
    const [logoutError, setLogoutError] = useState<unknown>();
    return (
        <WorkbenchProvider>
            <AppShell
                resources={resources}
                navigationGroups={navigationGroups}
                user={user}
                onLogout={() => {
                    setLogoutError(undefined);
                    void logout().catch(setLogoutError);
                }}
            >
                {!!logoutError && <ErrorState error={logoutError} />}
                <ErrorBoundary>
                    <Suspense
                        fallback={
                            loadingResource ? (
                                <CollectionLoading resource={loadingResource} activeView={new URLSearchParams(location.search).get("view")} />
                            ) : (
                                <Loading />
                            )
                        }
                    >
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
