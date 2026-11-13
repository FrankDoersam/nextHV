import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    ArrowRight,
    Building2,
    Check,
    Eye,
    EyeOff,
    ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Brand } from "./brand";
export function AuthScreen({
    onLogin,
}: {
    onLogin: (
        email: string,
        password: string,
        remember: boolean,
    ) => Promise<void>;
}) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [remember, setRemember] = useState(false);
    const [visible, setVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            await onLogin(email, password, remember);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Anmeldung fehlgeschlagen.",
            );
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="grid min-h-screen lg:grid-cols-2">
            <div className="flex flex-col px-8 py-8 lg:px-16">
                <Brand />
                <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-primary">
                        Willkommen zurück
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight">
                        Alles an seinem Platz.
                    </h1>
                    <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
                        Melde dich an und behalte deine Immobilien, Menschen und
                        Verträge im Blick.
                    </p>
                    <form onSubmit={submit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="email">E-Mail-Adresse</Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="username"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@verwaltung.de"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Passwort</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={visible ? "text" : "password"}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    required
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={
                                        visible
                                            ? "Passwort verbergen"
                                            : "Passwort anzeigen"
                                    }
                                    className="absolute right-1 top-0.5"
                                    onClick={() => setVisible(!visible)}
                                >
                                    {visible ? <EyeOff /> : <Eye />}
                                </Button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="remember"
                                checked={remember}
                                onCheckedChange={(v) => setRemember(!!v)}
                            />
                            <Label
                                htmlFor="remember"
                                className="text-xs font-normal"
                            >
                                Angemeldet bleiben
                            </Label>
                        </div>
                        {error && (
                            <p
                                role="alert"
                                className="rounded-lg bg-destructive/5 p-3 text-xs text-destructive"
                            >
                                {error}
                            </p>
                        )}
                        <Button
                            disabled={busy}
                            type="submit"
                            className="w-full"
                        >
                            {busy ? "Anmeldung …" : "Anmelden"}
                            <ArrowRight />
                        </Button>
                    </form>
                    <p className="mt-6 text-center text-xs text-muted-foreground">
                        Dein Zugang wird von deiner Verwaltung eingerichtet.
                    </p>
                </div>
                <p className="text-xs text-muted-foreground">
                    nextHV · Klarheit für deine Hausverwaltung
                </p>
            </div>
            <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-16 text-primary-foreground lg:flex">
                <div className="flex items-center gap-2 text-xs text-white/70">
                    <ShieldCheck size={16} />
                    Dein digitaler Verwaltungsraum
                </div>
                <div className="relative z-10">
                    <div className="mb-12 rounded-2xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur">
                        <div className="mb-6 flex items-center gap-3">
                            <span className="rounded-xl bg-white/15 p-3">
                                <Building2 size={25} />
                            </span>
                            <div>
                                <p className="font-medium">
                                    Ein System. Alle Zusammenhänge.
                                </p>
                                <p className="mt-1 text-xs text-white/60">
                                    Vom Objekt bis zur nächsten Kondition.
                                </p>
                            </div>
                        </div>
                        {[
                            "Objekte & Einheiten",
                            "Geschäftspartner & Rollen",
                            "Verträge & Konditionshistorie",
                        ].map((s, i) => (
                            <div
                                key={s}
                                className="flex items-center justify-between border-t border-white/10 py-4 text-sm"
                            >
                                <span>
                                    <span className="mr-4 text-white/40">
                                        0{i + 1}
                                    </span>
                                    {s}
                                </span>
                                <Check size={16} className="text-emerald-200" />
                            </div>
                        ))}
                    </div>
                    <h2 className="max-w-lg text-4xl font-medium leading-tight tracking-tight">
                        Weniger suchen.
                        <br />
                        Mehr Überblick.
                    </h2>
                    <p className="mt-5 max-w-md text-sm leading-7 text-white/65">
                        Eine klare Oberfläche für die Aufgaben, die deinen
                        Verwaltungsalltag bewegen.
                    </p>
                </div>
                <p className="relative z-10 mt-12 text-xs text-white/40">
                    Strukturiert. Verbunden. Weitergedacht.
                </p>
                <div className="pointer-events-none absolute -right-60 -top-36 size-[700px] rounded-full border-[100px] border-white/[.025]" />
            </div>
        </div>
    );
}
