"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarContent } from "@/components/app-sidebar";

/**
 * Hamburger button that opens the app sidebar in a drawer.
 * Rendered in page headers; hidden on md+ where the sidebar is always visible.
 */
export function MobileNavButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on any navigation (covers dropdown-menu router.push too).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1.5 size-7 shrink-0 text-muted-foreground md:hidden"
          />
        }
      >
        <MenuIcon className="size-4" />
        <span className="sr-only">Open navigation</span>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 max-w-[85vw] gap-0 bg-sidebar p-0"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
