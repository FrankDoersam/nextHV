import { cn } from "@/lib/utils";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
    "cn-button group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                default: "cn-button-variant-default",
                outline: "cn-button-variant-outline",
                secondary: "cn-button-variant-secondary",
                ghost: "cn-button-variant-ghost",
                destructive: "cn-button-variant-destructive",
                link: "cn-button-variant-link",
            },
            size: {
                default: "cn-button-size-default h-(--control-height)",
                xs: "cn-button-size-xs",
                sm: "cn-button-size-sm",
                lg: "cn-button-size-lg h-(--control-height-lg)",
                icon: "cn-button-size-icon size-(--control-height)",
                "icon-xs": "cn-button-size-icon-xs",
                "icon-sm": "cn-button-size-icon-sm",
                "icon-lg": "cn-button-size-icon-lg size-(--control-height-lg)",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

function Button({
    className,
    variant = "default",
    size = "default",
    ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
    return (
        <ButtonPrimitive
            data-slot="button"
            className={cn(buttonVariants({ variant, size, className }))}
            {...props}
        />
    );
}

export { Button, buttonVariants };
