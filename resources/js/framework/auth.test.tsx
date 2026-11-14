import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";
import { csrf, request } from "./data/http";

vi.mock("./data/http", async (original) => ({
    ...(await original<typeof import("./data/http")>()),
    csrf: vi.fn(async () => {}),
    request: vi.fn(),
}));
vi.mock("@/components/blocks/auth-screen", () => ({
    AuthScreen: () => <div>Anmelden</div>,
}));
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});
function Content() {
    return <span>{useAuth().user.name}</span>;
}
it("does not restore an expired session when an older identity request finishes late", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(csrf).mockResolvedValue(undefined);
    vi.mocked(request).mockImplementation(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const client = new QueryClient();
    client.setQueryData(["private"], "old session data");
    render(
        <QueryClientProvider client={client}>
            <AuthProvider>
                <Content />
            </AuthProvider>
        </QueryClientProvider>,
    );
    await waitFor(() => expect(request).toHaveBeenCalled());
    const signal = vi.mocked(request).mock.calls[0][3]!;
    act(() => window.dispatchEvent(new Event("auth:expired")));
    expect(signal.aborted).toBe(true);
    await act(async () =>
        finish({
            data: {
                id: 1,
                name: "Abgelaufene Sitzung",
                email: "test@example.test",
            },
        }),
    );
    expect(screen.getByText("Anmelden")).toBeVisible();
    expect(screen.queryByText("Abgelaufene Sitzung")).not.toBeInTheDocument();
    expect(client.getQueryData(["private"])).toBeUndefined();
});
