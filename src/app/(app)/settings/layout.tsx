"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MobileNavButton } from "@/components/mobile-nav";

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
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <MobileNavButton />
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>
      {/* Horizontal tabs on mobile, side nav on md+ */}
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              pathname === t.href && "bg-accent text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-48 shrink-0 flex-col gap-0.5 border-r border-border p-3 md:flex">
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
          <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6 md:py-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
