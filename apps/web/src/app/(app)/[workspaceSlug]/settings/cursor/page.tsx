import type { Metadata } from "next";
import { McpSettings } from "@/components/settings/mcp-settings";

export const metadata: Metadata = { title: "Cursor" };

export default function CursorSettingsPage() {
  return <McpSettings />;
}
