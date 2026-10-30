import type { Metadata } from "next";
import { McpSettings } from "@/components/settings/mcp-settings";

export const metadata: Metadata = { title: "Claude" };

export default function ClaudeSettingsPage() {
  return <McpSettings />;
}
