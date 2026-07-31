"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { issueLabels, issues, labels, workspaces } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import { getWorkspaceData } from "@/lib/queries";
import { LABEL_COLORS } from "@/lib/defaults";
import {
  adfToText,
  mapJiraAssignee,
  mapJiraPriority,
  mapJiraStatus,
  parseCsv,
  parseJiraDate,
} from "@/lib/jira/mapping";
import type { Member, StatusRow } from "@/lib/types";

export type ImportReport = {
  created: number;
  skipped: number;
  createdLabels: string[];
  unmatchedAssignees: string[];
  errors: string[];
};

type ImportRow = {
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  labels: string[];
  createdAt?: Date;
  updatedAt?: Date;
};

async function runImport(rows: ImportRow[]): Promise<ImportReport> {
  const { workspace, user } = await requireWorkspace();
  const data = await getWorkspaceData(
    { id: workspace.id, name: workspace.name, prefix: workspace.prefix },
    user.id
  );

  const report: ImportReport = {
    created: 0,
    skipped: 0,
    createdLabels: [],
    unmatchedAssignees: [],
    errors: [],
  };

  const labelCache = new Map(
    data.labels.map((l) => [l.name.toLowerCase(), l.id])
  );

  async function labelId(name: string): Promise<string> {
    const key = name.toLowerCase();
    const cached = labelCache.get(key);
    if (cached) return cached;
    const [created] = await db
      .insert(labels)
      .values({
        workspaceId: workspace.id,
        name,
        color: LABEL_COLORS[labelCache.size % LABEL_COLORS.length],
      })
      .onConflictDoNothing()
      .returning();
    let id = created?.id;
    if (id) {
      report.createdLabels.push(name);
    } else {
      const existing = await db.query.labels.findFirst({
        where: and(eq(labels.workspaceId, workspace.id), eq(labels.name, name)),
      });
      id = existing!.id;
    }
    labelCache.set(key, id);
    return id;
  }

  for (const row of rows) {
    if (!row.title.trim()) {
      report.skipped++;
      continue;
    }
    try {
      const status: StatusRow = mapJiraStatus(row.status, data.statuses);
      const assignee: Member | null = mapJiraAssignee(row.assignee, data.members);
      if (row.assignee.trim() && !assignee) {
        if (!report.unmatchedAssignees.includes(row.assignee.trim())) {
          report.unmatchedAssignees.push(row.assignee.trim());
        }
      }

      const [ws] = await db
        .update(workspaces)
        .set({ issueCounter: sql`${workspaces.issueCounter} + 1` })
        .where(eq(workspaces.id, workspace.id))
        .returning({ counter: workspaces.issueCounter });

      const [issue] = await db
        .insert(issues)
        .values({
          workspaceId: workspace.id,
          number: ws.counter,
          title: row.title.trim().slice(0, 500),
          description: row.description.trim(),
          priority: mapJiraPriority(row.priority),
          statusId: status.id,
          assigneeId: assignee?.id ?? null,
          creatorId: user.id,
          boardOrder: Date.now() + report.created,
          ...(row.createdAt ? { createdAt: row.createdAt } : {}),
          ...(row.updatedAt
            ? { updatedAt: row.updatedAt }
            : row.createdAt
              ? { updatedAt: row.createdAt }
              : {}),
        })
        .returning();

      for (const name of row.labels.filter((l) => l.trim())) {
        const id = await labelId(name.trim());
        await db
          .insert(issueLabels)
          .values({ issueId: issue.id, labelId: id })
          .onConflictDoNothing();
      }

      report.created++;
    } catch (e) {
      report.errors.push(
        `"${row.title.slice(0, 60)}": ${e instanceof Error ? e.message : "unknown error"}`
      );
    }
  }

  revalidatePath("/board");
  revalidatePath("/issues");
  return report;
}

export async function importJiraCsv(formData: FormData): Promise<ImportReport> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return {
      created: 0,
      skipped: 0,
      createdLabels: [],
      unmatchedAssignees: [],
      errors: ["CSV appears to be empty"],
    };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const summaryIdx = col("summary");
  if (summaryIdx === -1) {
    return {
      created: 0,
      skipped: 0,
      createdLabels: [],
      unmatchedAssignees: [],
      errors: ['CSV is missing a "Summary" column — export issues from Jira as CSV (all fields).'],
    };
  }
  const descIdx = col("description");
  const statusIdx = col("status");
  const priorityIdx = col("priority");
  const assigneeIdx = header.findIndex((h) => h === "assignee" || h === "assignee email");
  const createdIdx = col("created");
  const updatedIdx = col("updated");
  // Jira exports repeat the "Labels" column for each label
  const labelIdxs = header
    .map((h, i) => (h === "labels" ? i : -1))
    .filter((i) => i !== -1);

  const importRows: ImportRow[] = rows.slice(1).map((r) => ({
    title: r[summaryIdx] ?? "",
    description: descIdx !== -1 ? (r[descIdx] ?? "") : "",
    status: statusIdx !== -1 ? (r[statusIdx] ?? "") : "",
    priority: priorityIdx !== -1 ? (r[priorityIdx] ?? "") : "",
    assignee: assigneeIdx !== -1 ? (r[assigneeIdx] ?? "") : "",
    labels: labelIdxs.map((i) => r[i] ?? "").filter(Boolean),
    createdAt: createdIdx !== -1 ? parseJiraDate(r[createdIdx]) : undefined,
    updatedAt: updatedIdx !== -1 ? parseJiraDate(r[updatedIdx]) : undefined,
  }));

  return runImport(importRows);
}

type JiraApiIssue = {
  fields: {
    summary?: string;
    description?: unknown;
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: { emailAddress?: string; displayName?: string } | null;
    labels?: string[];
    created?: string;
    updated?: string;
  };
};

export async function importJiraApi(input: {
  siteUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}): Promise<ImportReport> {
  await requireWorkspace();

  const base = input.siteUrl.replace(/\/+$/, "");
  const authHeader = `Basic ${Buffer.from(`${input.email}:${input.apiToken}`).toString("base64")}`;

  const all: JiraApiIssue[] = [];
  let nextPageToken: string | undefined;

  for (let page = 0; page < 40; page++) {
    const params = new URLSearchParams({
      jql: `project = ${input.projectKey} ORDER BY created ASC`,
      maxResults: "100",
      fields: "summary,description,status,priority,assignee,labels,created,updated",
    });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    const res = await fetch(`${base}/rest/api/3/search/jql?${params}`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Jira API error ${res.status}: ${body.slice(0, 200) || res.statusText}`
      );
    }
    const data = (await res.json()) as {
      issues?: JiraApiIssue[];
      nextPageToken?: string;
      isLast?: boolean;
    };
    all.push(...(data.issues ?? []));
    if (data.isLast !== false || !data.nextPageToken) break;
    nextPageToken = data.nextPageToken;
  }

  const rows: ImportRow[] = all.map((i) => ({
    title: i.fields.summary ?? "",
    description:
      typeof i.fields.description === "string"
        ? i.fields.description
        : adfToText(i.fields.description).trim(),
    status: i.fields.status?.name ?? "",
    priority: i.fields.priority?.name ?? "",
    assignee:
      i.fields.assignee?.emailAddress ?? i.fields.assignee?.displayName ?? "",
    labels: i.fields.labels ?? [],
    createdAt: parseJiraDate(i.fields.created),
    updatedAt: parseJiraDate(i.fields.updated),
  }));

  return runImport(rows);
}
