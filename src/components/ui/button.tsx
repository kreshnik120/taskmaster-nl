import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2",
    "whitespace-nowrap text-sm font-medium",
    "ring-offset-background transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    // ACTIVE STATE - universeel tactiele feedback
    "active:scale-[0.98] active:transition-none",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
  ),
  {
    variants: {
      variant: {
        // Primary with gradient, glow, and active state
        default: cn(
          "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground",
          "shadow-[0_2px_8px_hsla(221,83%,53%,0.20),inset_0_1px_1px_rgba(255,255,255,0.15)]",
          "hover:shadow-[0_4px_16px_hsla(221,83%,53%,0.30),inset_0_1px_2px_rgba(255,255,255,0.2)]",
          "hover:from-primary/95 hover:to-primary/85",
          "active:shadow-[0_1px_4px_hsla(221,83%,53%,0.15)] active:from-primary/90"
        ),
        destructive: cn(
          "bg-gradient-to-b from-destructive to-destructive/90 text-destructive-foreground",
          "shadow-[0_2px_8px_hsla(0,84%,60%,0.20),inset_0_1px_1px_rgba(255,255,255,0.15)]",
          "hover:shadow-[0_4px_16px_hsla(0,84%,60%,0.30)]",
          "hover:from-destructive/95 hover:to-destructive/85",
          "active:shadow-[0_1px_4px_hsla(0,84%,60%,0.15)] active:from-destructive/90"
        ),
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-primary underline-offset-4 hover:underline",
        // Glass variant - visionOS style with enhanced depth
        glass: cn(
          "bg-white/70 backdrop-blur-md border border-white/40 text-foreground",
          "shadow-[0_2px_8px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.2)]",
          "hover:bg-white/85 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.25)]",
          "dark:bg-slate-800/70 dark:border-white/20 dark:hover:bg-slate-800/85",
          "active:bg-white/60 active:shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
        ),
      },
      size: {
        default: "h-10 px-4 py-2 rounded-lg",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
