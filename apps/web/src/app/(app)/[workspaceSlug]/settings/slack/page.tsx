import type { Metadata } from "next";
import { SlackSettings } from "@/components/settings/slack-settings";

export const metadata: Metadata = { title: "Slack" };

export default function SlackSettingsPage() {
  return <SlackSettings />;
}
