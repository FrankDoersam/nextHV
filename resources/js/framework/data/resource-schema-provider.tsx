import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ErrorState, Loading } from "@/components/blocks/content";
import { PageWrapper } from "@/components/blocks/layout";
import type { ResourceDefinition } from "../types";
import { hydrateResources, loadResourceSchemas } from "./resource-schema";

/** The authenticated app becomes available only after all registered definitions are complete. */
export function ResourceSchemaProvider({
    resources,
    userId,
    children,
}: {
    resources: ResourceDefinition[];
    userId: number;
    children: ReactNode;
}) {
    const schema = useQuery({
        queryKey: [
            "resource-schema",
            userId,
            resources.map((resource) => resource.name),
        ],
        queryFn: async ({ signal }) => {
            const metadata = await loadResourceSchemas(
                resources,
                userId,
                signal,
            );
            hydrateResources(resources, metadata);
            return true;
        },
        staleTime: Infinity,
        retry: false,
    });
    if (schema.isError)
        return (
            <PageWrapper>
                <ErrorState
                    error={schema.error}
                    retry={() => void schema.refetch()}
                />
            </PageWrapper>
        );
    if (!schema.data)
        return (
            <PageWrapper>
                <Loading />
            </PageWrapper>
        );
    return children;
}
