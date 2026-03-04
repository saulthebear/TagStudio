import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@tagstudio/ui";
import { forwardRef } from "react";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuLabel = DropdownMenuPrimitive.Label;
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator;

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuContentProps
>(function DropdownMenuContent({ className, sideOffset = 8, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-56 overflow-hidden rounded-xl border border-[var(--ui-control-border)] bg-[var(--ui-control-bg)] p-1 text-[var(--ui-control-text)] shadow-[0_12px_30px_rgba(15,23,42,0.16)]",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuCheckboxItem = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuCheckboxItemProps
>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-[var(--ui-primary-bg)] focus-visible:bg-[var(--ui-primary-bg)]",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 inline-flex size-4 items-center justify-center text-[var(--ui-primary-text)]">
        <DropdownMenuPrimitive.ItemIndicator>✓</DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

