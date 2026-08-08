import type { Metadata } from "next";
import { ImportPanel } from "@/components/settings/import-panel";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return <ImportPanel />;
}
