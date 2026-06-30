"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, HardHat } from "lucide-react";
import { cn } from "@/lib/cn";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onProjects =
    pathname === "/" || pathname === "/projects" || pathname.startsWith("/feasibility");

  return (
    <div className="flex h-screen bg-white">
      <aside className="flex w-52 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <HardHat className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">ADU Feasibility</p>
            <p className="text-[10px] text-slate-500">Burbank · local-first</p>
          </div>
        </div>

        <nav className="p-3">
          <Link
            href="/"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              onProjects
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <FolderKanban className="h-4 w-4 shrink-0" />
            Projects
          </Link>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
