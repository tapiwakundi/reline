"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUpIcon, GlobeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  importJiraApi,
  importJiraCsv,
  type ImportReport,
} from "@/lib/actions/import";

function Report({ report }: { report: ImportReport }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm">
      <p className="font-medium">
        Imported {report.created} issue{report.created === 1 ? "" : "s"}
        {report.skipped > 0 && `, skipped ${report.skipped} empty row(s)`}.
      </p>
      {report.createdLabels.length > 0 && (
        <p className="mt-2 text-muted-foreground">
          Created labels: {report.createdLabels.join(", ")}
        </p>
      )}
      {report.unmatchedAssignees.length > 0 && (
        <p className="mt-2 text-muted-foreground">
          Unmatched assignees (left unassigned):{" "}
          {report.unmatchedAssignees.join(", ")}
        </p>
      )}
      {report.errors.length > 0 && (
        <div className="mt-2 text-destructive">
          {report.errors.slice(0, 5).map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function ImportPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function submitCsv(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a CSV file first");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      try {
        const r = await importJiraCsv(fd);
        setReport(r);
        toast.success(`Imported ${r.created} issues`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed");
      }
    });
  }

  function submitApi(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const r = await importJiraApi({
          siteUrl: String(form.get("siteUrl")),
          email: String(form.get("email")),
          apiToken: String(form.get("apiToken")),
          projectKey: String(form.get("projectKey")),
        });
        setReport(r);
        toast.success(`Imported ${r.created} issues`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Import from Jira</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One-time import of your Jira issues. Statuses, priorities, labels, and
          assignees are mapped automatically; anything unknown lands in Backlog
          or unassigned.
        </p>
      </div>

      <Tabs defaultValue="csv">
        <TabsList>
          <TabsTrigger value="csv" className="gap-1.5">
            <FileUpIcon className="size-3.5" /> CSV export
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5">
            <GlobeIcon className="size-3.5" /> Jira Cloud API
          </TabsTrigger>
        </TabsList>

        <TabsContent value="csv" className="mt-4">
          <form
            onSubmit={submitCsv}
            className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm text-muted-foreground">
              In Jira: Filters → search your project → Export → CSV (all
              fields). Then upload the file here.
            </p>
            <Input ref={fileRef} type="file" accept=".csv,text/csv" />
            <Button type="submit" disabled={pending} className="self-start">
              {pending ? "Importing…" : "Import CSV"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="api" className="mt-4">
          <form
            onSubmit={submitApi}
            className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm text-muted-foreground">
              Pulls all issues from one project via the Jira Cloud REST API.
              Your token is used once for this import and never stored. Create
              one at id.atlassian.com → Security → API tokens.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="siteUrl">Site URL</Label>
                <Input
                  id="siteUrl"
                  name="siteUrl"
                  placeholder="https://yourteam.atlassian.net"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="projectKey">Project key</Label>
                <Input id="projectKey" name="projectKey" placeholder="PROJ" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="jira-email">Atlassian email</Label>
                <Input id="jira-email" name="email" type="email" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="apiToken">API token</Label>
                <Input id="apiToken" name="apiToken" type="password" required />
              </div>
            </div>
            <Button type="submit" disabled={pending} className="self-start">
              {pending ? "Importing…" : "Import from Jira"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {report && <Report report={report} />}
    </div>
  );
}
