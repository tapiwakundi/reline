import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadSlackLinkPreview } from "@/lib/slack-link-preview-load";
import { isSlackLinkExpandingAgent } from "@/lib/slack-link-preview";

async function previewFor(slug: string, key: string) {
  const headerList = await headers();
  if (!isSlackLinkExpandingAgent(headerList.get("user-agent"))) return null;
  return loadSlackLinkPreview(slug, key);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}): Promise<Metadata> {
  const { slug, key } = await params;
  const preview = await previewFor(slug, key);
  const title = preview?.title || key;
  return {
    title: { absolute: title },
    description: preview?.description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: preview?.description,
      siteName: "Reline",
    },
  };
}

export default async function SlackLinkPreviewPage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  const headerList = await headers();
  if (!isSlackLinkExpandingAgent(headerList.get("user-agent"))) notFound();

  const { slug, key } = await params;
  const preview = await loadSlackLinkPreview(slug, key);
  const title = preview?.title || key;
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 px-6 py-16">
      <h1 className="text-xl font-semibold">{title}</h1>
      {preview?.description ? (
        <p className="text-sm text-muted-foreground">{preview.description}</p>
      ) : null}
    </main>
  );
}
