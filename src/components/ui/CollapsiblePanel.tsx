"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function CollapsiblePanel({
  title,
  side,
  storageKey,
  defaultOpen = true,
  expandedWidthClass,
  badge,
  children,
  className,
}: {
  title: string;
  side: "left" | "right";
  storageKey: string;
  defaultOpen?: boolean;
  expandedWidthClass: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      setOpen(stored === "true");
    } else {
      setOpen(
        defaultOpen && typeof window !== "undefined" && window.innerWidth >= 1024
      );
    }
    setMounted(true);
  }, [storageKey, defaultOpen]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }

  const Chevron = side === "right" ? ChevronRight : ChevronLeft;
  const chevronOpen = side === "right" ? open : open;

  if (!mounted) {
    return (
      <div
        className={cn(
          "flex shrink-0 border-slate-200",
          side === "right" ? "border-l" : "border-r",
          expandedWidthClass,
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col border-slate-200 transition-[width] duration-200",
        side === "right" ? "border-l" : "border-r",
        open ? expandedWidthClass : "w-10",
        className
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-3 text-left hover:bg-slate-100",
          open ? "justify-between px-3" : "justify-center"
        )}
        aria-expanded={open}
      >
        {open ? (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xs font-bold uppercase tracking-wide text-slate-500">
                {title}
              </span>
              {badge}
            </span>
            <Chevron
              className={cn(
                "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                chevronOpen && side === "right" && "rotate-180",
                chevronOpen && side === "left" && "rotate-180"
              )}
            />
          </>
        ) : (
          <Chevron className="h-4 w-4 text-slate-500" />
        )}
      </button>
      {open && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      )}
    </div>
  );
}
