"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/settings", label: "General" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/labels", label: "Labels" },
  { href: "/settings/import", label: "Import" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-border p-3">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                pathname === t.href && "bg-accent text-foreground"
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-6 py-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
