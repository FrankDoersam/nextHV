import type { RecordId } from "@/framework/record-id";
import { invalidatePermissions } from "./permissions";
import { clearResourceSchemaCache } from "./data/resource-schema";
import { AuthScreen } from "@/components/blocks/auth-screen";
import { ErrorState, Loading } from "@/components/blocks/content";
import { useQueryClient } from "@tanstack/react-query";
import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { ApiError, csrf, request } from "./data/http";
interface Identity {
    id: RecordId;
    name: string;
    email: string;
}
const AuthContext = createContext<{
    user: Identity;
    logout: () => Promise<void>;
} | null>(null);
export function useAuth() {
    const value = useContext(AuthContext);
    if (!value) throw new Error("Anmeldung erforderlich.");
    return value;
}
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<Identity | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<unknown>();
    const client = useQueryClient();
    const pendingLoad = useRef<AbortController | undefined>(undefined);
    const cancelLoad = () => {
        pendingLoad.current?.abort();
        pendingLoad.current = undefined;
    };
    const load = async () => {
        cancelLoad();
        const controller = new AbortController();
        pendingLoad.current = controller;
        setError(undefined);
        setLoading(true);
        try {
            await csrf();
            if (controller.signal.aborted) return;
            const r = await request<{ data: Identity }>(
                "/auth/user",
                undefined,
                "GET",
                controller.signal,
            );
            if (pendingLoad.current === controller) setUser(r.data);
        } catch (e) {
            if (
                !controller.signal.aborted &&
                !(e instanceof ApiError && e.status === 401)
            )
                setError(e);
        } finally {
            if (pendingLoad.current === controller) {
                pendingLoad.current = undefined;
                setLoading(false);
            }
        }
    };
    useEffect(() => {
        void load();
        const expire = () => {
            cancelLoad();
            setLoading(false);
            setError(undefined);
            setUser(null);
            clearResourceSchemaCache();
            invalidatePermissions();
            client.clear();
        };
        window.addEventListener("auth:expired", expire);
        return () => {
            cancelLoad();
            window.removeEventListener("auth:expired", expire);
        };
    }, []);
    const login = async (
        email: string,
        password: string,
        remember: boolean,
    ) => {
        await csrf();
        const r = await request<{ data: Identity }>("/auth/login", {
            email,
            password,
            remember,
        });
        cancelLoad();
        clearResourceSchemaCache();
        invalidatePermissions();
        setUser(r.data);
        client.clear();
    };
    const logout = async () => {
        await request("/auth/logout", {});
        cancelLoad();
        setUser(null);
        clearResourceSchemaCache();
        invalidatePermissions();
        client.clear();
    };
    if (loading)
        return (
            <div className="mx-auto max-w-lg p-12">
                <Loading />
            </div>
        );
    if (error)
        return (
            <div className="mx-auto max-w-lg p-12">
                <ErrorState error={error} retry={load} />
            </div>
        );
    if (!user) return <AuthScreen onLogin={login} />;
    return (
        <AuthContext.Provider value={{ user, logout }}>
            {children}
        </AuthContext.Provider>
    );
}
