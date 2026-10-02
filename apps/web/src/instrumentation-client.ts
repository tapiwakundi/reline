import posthog from "posthog-js";
import {
  normalizePostHogHost,
  POSTHOG_PROXY_PATH,
  posthogUiHost,
} from "@/lib/posthog-config";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (token) {
  const ingestHost = normalizePostHogHost(process.env.NEXT_PUBLIC_POSTHOG_HOST);
  posthog.init(token, {
    api_host: POSTHOG_PROXY_PATH,
    ui_host: posthogUiHost(ingestHost),
    defaults: "2026-05-30",
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_exceptions: true,
    person_profiles: "identified_only",
    tracing_headers:
      typeof window === "undefined" ? [] : [window.location.hostname],
  });
}
