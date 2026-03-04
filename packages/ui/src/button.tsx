import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex shrink-0 appearance-none items-center justify-center whitespace-nowrap rounded-[var(--ui-control-radius)] border text-sm font-semibold leading-none shadow-[var(--ui-control-shadow)] outline-none transition-colors duration-150 focus-visible:border-[var(--ui-focus-border)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus-ring)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "border-[var(--ui-primary-border)] bg-[var(--ui-primary-bg)] text-[var(--ui-primary-text)] hover:bg-[var(--ui-primary-bg-hover)]",
        secondary:
          "border-[var(--ui-control-border)] bg-[var(--ui-control-bg)] text-[var(--ui-control-text)] hover:border-[var(--color-border-strong)] hover:bg-[var(--ui-control-bg-hover)]"
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-base"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "md"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...props },
  ref
) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
