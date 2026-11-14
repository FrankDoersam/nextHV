import { useState } from "react";
import { Check, Link } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({
    onError,
}: {
    onError: (error: unknown) => void;
}) {
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={copied ? "Direktlink kopiert" : "Direktlink kopieren"}
            title={copied ? "Direktlink kopiert" : "Direktlink kopieren"}
            onClick={async () => {
                setBusy(true);
                try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                } catch {
                    setCopied(false);
                    onError(
                        new Error(
                            "Direktlink konnte nicht kopiert werden. Du kannst die Adresse aus der Browserzeile kopieren.",
                        ),
                    );
                } finally {
                    setBusy(false);
                }
            }}
        >
            {copied ? <Check /> : <Link />}
            <span role="status" className="sr-only">
                {copied ? "Direktlink kopiert" : ""}
            </span>
        </Button>
    );
}
