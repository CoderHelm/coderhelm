"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { useModalLayer } from "./modal";

/**
 * The one floating panel: pickers and menus open in it. It is portaled (inside
 * a modal, into the modal's box; anywhere else, into <body>) and placed by
 * Radix against the window with collision handling, so a card's or a
 * modal's edge never cuts it off: it flips above the trigger when there is
 * no room below and never grows past the space it has
 * (`--radix-popover-content-available-height`).
 */
export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;

/** The panel look shared by every popover, menu and picker. */
export const panelClass = "rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-zinc-200 shadow-xl outline-none";

export const PopoverContent = forwardRef<
  ElementRef<typeof RadixPopover.Content>,
  ComponentPropsWithoutRef<typeof RadixPopover.Content>
>(function PopoverContent({ className = "", align = "start", sideOffset = 4, collisionPadding = 8, style, ...props }, ref) {
  const layer = useModalLayer();
  return (
    <RadixPopover.Portal container={layer ?? undefined}>
      <RadixPopover.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        avoidCollisions
        data-popover
        style={{ maxHeight: "var(--radix-popover-content-available-height)", ...style }}
        className={`z-[80] ${panelClass} ${className}`}
        {...props}
      />
    </RadixPopover.Portal>
  );
});
