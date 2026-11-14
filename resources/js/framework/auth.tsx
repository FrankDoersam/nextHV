import { clearResourceSchemaCache } from "./data/resource-schema";
import { AuthScreen } from "@/components/blocks/auth-screen";
import { ErrorState, Loading } from "@/components/blocks/content";
import { useQueryClient } from "@tanstack/react-query";
import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { ApiError, csrf, request } from "./data/http";
interface Identity {
    id: number;
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
    const load = async () => {
        setError(undefined);
        setLoading(true);
        try {
            await csrf();
            const r = await request<{ data: Identity }>("/auth/user");
            setUser(r.data);
        } catch (e) {
            if (!(e instanceof ApiError && e.status === 401)) setError(e);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void load();
        const expire = () => {
            setUser(null);
            clearResourceSchemaCache();
            client.clear();
        };
        window.addEventListener("auth:expired", expire);
        return () => window.removeEventListener("auth:expired", expire);
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
        clearResourceSchemaCache();
        setUser(r.data);
        client.clear();
    };
    const logout = async () => {
        await request("/auth/logout", {});
        setUser(null);
        clearResourceSchemaCache();
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
