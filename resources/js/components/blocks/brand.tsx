import { Link } from "react-router";
import { Building2 } from "lucide-react";
export function Brand() {
    return (
        <Link
            to="/"
            aria-label="nextHV Startseite"
            className="inline-flex items-center gap-2 text-base font-semibold tracking-tight"
        >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 size={16} />
            </span>
            <span>nextHV</span>
        </Link>
    );
}
