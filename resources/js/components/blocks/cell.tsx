import type { MouseEventHandler, ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

type CellBaseProps = {
    children: ReactNode;
    className?: string;
    title?: string;
};

type CellLinkProps = CellBaseProps & {
    to: string;
    onClick?: never;
    onDoubleClick?: MouseEventHandler<HTMLAnchorElement>;
};

type CellButtonProps = CellBaseProps & {
    to?: never;
    onClick: () => void;
    onDoubleClick?: MouseEventHandler<HTMLButtonElement>;
};

/** REUI-style interactive cell content: neutral text, discreet hover and visible keyboard focus. */
export function Cell(props: CellLinkProps | CellButtonProps) {
    const className = cn(
        "block min-w-0 max-w-full rounded-sm text-left font-medium text-foreground no-underline decoration-foreground/30 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        props.className,
    );

    if (props.to !== undefined) {
        return (
            <Link
                data-slot="cell"
                to={props.to}
                title={props.title}
                className={className}
                onDoubleClick={props.onDoubleClick}
            >
                {props.children}
            </Link>
        );
    }

    return (
        <button
            data-slot="cell"
            type="button"
            title={props.title}
            className={className}
            onClick={props.onClick}
            onDoubleClick={props.onDoubleClick}
        >
            {props.children}
        </button>
    );
}
