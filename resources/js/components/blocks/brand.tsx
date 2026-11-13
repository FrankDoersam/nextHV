import { Link } from "react-router";
import { Building2 } from "lucide-react";
export function Brand() {
    return (
        <Link
            to="/"
            className="flex items-center gap-2.5 font-semibold tracking-tight"
        >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Building2 size={18} />
            </span>
            <span>nextHV</span>
        </Link>
    );
}
