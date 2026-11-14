import { BaseField } from "@/components/fields/base-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Frame, FrameFooter, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
    AlertCircle,
    ArrowRight,
    Eye,
    EyeOff,
    LoaderCircle,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Brand } from "./brand";

/** Centered photo-backdrop authentication composed from the same fields and Frame as the workspace. */
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
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await onLogin(email, password, remember);
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Anmeldung fehlgeschlagen.",
            );
        } finally {
            setBusy(false);
        }
    };
    return (
        <div
            data-slot="auth-screen"
            className="relative isolate flex min-h-dvh flex-col overflow-x-hidden bg-muted"
        >
            <img
                src="/images/auth-residence.webp"
                alt=""
                aria-hidden="true"
                fetchPriority="high"
                className="pointer-events-none absolute inset-0 -z-20 size-full object-cover object-center"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-background/35 backdrop-blur-[2px]"
            />
            <header className="flex shrink-0 px-5 py-5 sm:px-8">
                <div className="rounded-xl border border-white/60 bg-card/95 px-3 py-2 shadow-xs">
                    <Brand />
                </div>
            </header>
            <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
                <Frame
                    spacing="lg"
                    className="w-full max-w-[420px] border-white/70 bg-card/95 shadow-xl shadow-black/10 backdrop-blur-md"
                >
                    <FramePanel className="px-6 py-7 sm:px-8 sm:py-8">
                        <section
                            aria-labelledby="auth-title"
                            className="space-y-7"
                        >
                            <div className="space-y-2 text-center">
                                <h1
                                    id="auth-title"
                                    className="text-2xl font-semibold tracking-tight"
                                >
                                    Willkommen zurück
                                </h1>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    Dein Überblick über Immobilien, Menschen und
                                    Verträge.
                                </p>
                            </div>
                            <form
                                onSubmit={submit}
                                aria-busy={busy}
                                className="space-y-5"
                            >
                                <BaseField id="email" label="E-Mail-Adresse">
                                    <Input
                                        id="email"
                                        type="email"
                                        autoComplete="username"
                                        value={email}
                                        onChange={(event) =>
                                            setEmail(event.target.value)
                                        }
                                        placeholder="name@verwaltung.de"
                                        required
                                        disabled={busy}
                                        className="h-10"
                                    />
                                </BaseField>
                                <BaseField id="password" label="Passwort">
                                    <InputGroup className="h-10 bg-card">
                                        <InputGroupInput
                                            id="password"
                                            type={visible ? "text" : "password"}
                                            autoComplete="current-password"
                                            value={password}
                                            onChange={(event) =>
                                                setPassword(event.target.value)
                                            }
                                            required
                                            disabled={busy}
                                            className="h-10"
                                        />
                                        <InputGroupAddon align="inline-end">
                                            <InputGroupButton
                                                size="icon-sm"
                                                aria-label={
                                                    visible
                                                        ? "Passwort verbergen"
                                                        : "Passwort anzeigen"
                                                }
                                                aria-pressed={visible}
                                                onClick={() =>
                                                    setVisible(
                                                        (value) => !value,
                                                    )
                                                }
                                            >
                                                {visible ? <EyeOff /> : <Eye />}
                                            </InputGroupButton>
                                        </InputGroupAddon>
                                    </InputGroup>
                                </BaseField>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="remember"
                                        checked={remember}
                                        disabled={busy}
                                        onCheckedChange={(value) =>
                                            setRemember(!!value)
                                        }
                                    />
                                    <Label
                                        htmlFor="remember"
                                        className="text-xs font-normal"
                                    >
                                        Angemeldet bleiben
                                    </Label>
                                </div>
                                {error && (
                                    <Alert variant="destructive">
                                        <AlertCircle />
                                        <AlertTitle>
                                            Anmeldung nicht möglich
                                        </AlertTitle>
                                        <AlertDescription>
                                            {error}
                                        </AlertDescription>
                                    </Alert>
                                )}
                                <Button
                                    disabled={busy}
                                    type="submit"
                                    className="h-10 w-full"
                                >
                                    {busy ? (
                                        <LoaderCircle className="animate-spin" />
                                    ) : null}
                                    {busy ? "Anmeldung …" : "Anmelden"}
                                    {!busy && <ArrowRight />}
                                </Button>
                            </form>
                        </section>
                    </FramePanel>
                    <FrameFooter className="py-3 text-center text-xs leading-5 text-muted-foreground">
                        Dein Zugang wird von deiner Verwaltung eingerichtet.
                    </FrameFooter>
                </Frame>
            </main>
            <footer className="px-5 pb-5 text-center text-xs font-medium text-foreground/80">
                nextHV · Raum für einen klaren Überblick
            </footer>
        </div>
    );
}
