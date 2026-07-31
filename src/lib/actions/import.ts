"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { cycles, issueLabels, issues, labels, workspaces } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import { getWorkspaceData } from "@/lib/queries";
import { LABEL_COLORS } from "@/lib/defaults";
import {
  adfToText,
  mapJiraAssignee,
  mapJiraPriority,
  mapJiraStatus,
  mapSprintToCycleStatus,
  parseCsv,
  parseJiraDate,
  parseJiraSprintCsvCell,
  parseJiraSprintField,
  pickCurrentSprint,
  sortSprintsChronologically,
  type JiraSprint,
} from "@/lib/jira/mapping";
import type { Member, StatusRow } from "@/lib/types";

export type ImportReport = {
  created: number;
  skipped: number;
  createdLabels: string[];
  createdCycles: string[];
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
  /** Sprints this issue belonged to; the latest/active one becomes its cycle. */
  sprints: JiraSprint[];
  createdAt?: Date;
  updatedAt?: Date;
};

function emptyReport(errors: string[] = []): ImportReport {
  return {
    created: 0,
    skipped: 0,
    createdLabels: [],
    createdCycles: [],
    unmatchedAssignees: [],
    errors,
  };
}

function mergeSprintMeta(into: JiraSprint, from: JiraSprint): JiraSprint {
  return {
    key: into.key,
    jiraId: into.jiraId ?? from.jiraId,
    name: into.name || from.name,
    state:
      into.state === "active" || from.state === "active"
        ? "active"
        : into.state === "closed" || from.state === "closed"
          ? "closed"
          : into.state ?? from.state,
    startDate: into.startDate ?? from.startDate,
    endDate: into.endDate ?? from.endDate,
  };
}

function defaultSprintWindow(
  sprint: JiraSprint,
  issueDates: Date[]
): { startDate: Date; endDate: Date } {
  if (sprint.startDate && sprint.endDate) {
    return { startDate: sprint.startDate, endDate: sprint.endDate };
  }
  const earliest = issueDates.length
    ? new Date(Math.min(...issueDates.map((d) => d.getTime())))
    : new Date();
  const startDate = sprint.startDate ?? earliest;
  const endDate =
    sprint.endDate ??
    new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  return { startDate, endDate };
}

async function ensureCyclesFromSprints(
  workspaceId: string,
  rows: ImportRow[],
  report: ImportReport
): Promise<Map<string, string>> {
  const sprintByKey = new Map<string, JiraSprint>();
  const datesByKey = new Map<string, Date[]>();

  for (const row of rows) {
    for (const sprint of row.sprints) {
      const existing = sprintByKey.get(sprint.key);
      sprintByKey.set(
        sprint.key,
        existing ? mergeSprintMeta(existing, sprint) : sprint
      );
      if (row.createdAt) {
        const list = datesByKey.get(sprint.key) ?? [];
        list.push(row.createdAt);
        datesByKey.set(sprint.key, list);
      }
    }
  }

  if (sprintByKey.size === 0) return new Map();

  const ordered = sortSprintsChronologically([...sprintByKey.values()]);
  const cycleIdBySprintKey = new Map<string, string>();

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { cycleCounter: true },
  });
  let nextNumber = ws?.cycleCounter ?? 0;

  const windows = new Map(
    ordered.map((s) => [
      s.key,
      defaultSprintWindow(s, datesByKey.get(s.key) ?? []),
    ])
  );

  const now = new Date();
  // Only one active cycle is allowed — pick the chronologically latest active
  // sprint. CSV exports carry no sprint state, so fall back to the latest
  // stateless sprint whose date window contains today.
  const activeKey =
    [...ordered]
      .reverse()
      .find((s) => mapSprintToCycleStatus(s.state) === "active")?.key ??
    [...ordered].reverse().find((s) => {
      if (s.state) return false;
      const w = windows.get(s.key)!;
      return w.startDate <= now && w.endDate >= now;
    })?.key;

  for (const sprint of ordered) {
    nextNumber += 1;
    const { startDate, endDate } = windows.get(sprint.key)!;
    const mapped = mapSprintToCycleStatus(sprint.state);
    let status: "planned" | "active" | "completed" =
      mapped === "active"
        ? sprint.key === activeKey
          ? "active"
          : "planned"
        : mapped;
    if (!sprint.state) {
      // No state in the export — derive it from the dates.
      if (endDate < now) status = "completed";
      else if (sprint.key === activeKey) status = "active";
    }

    const [created] = await db
      .insert(cycles)
      .values({
        workspaceId,
        number: nextNumber,
        name: sprint.name.slice(0, 200),
        startDate,
        endDate,
        status,
      })
      .returning({ id: cycles.id });

    cycleIdBySprintKey.set(sprint.key, created.id);
    report.createdCycles.push(sprint.name);
  }

  // Demote any pre-existing active cycle if this import brought one in.
  if (activeKey) {
    const activeId = cycleIdBySprintKey.get(activeKey)!;
    await db
      .update(cycles)
      .set({ status: "planned" })
      .where(
        and(
          eq(cycles.workspaceId, workspaceId),
          eq(cycles.status, "active"),
          ne(cycles.id, activeId)
        )
      );
  }

  await db
    .update(workspaces)
    .set({ cycleCounter: nextNumber })
    .where(eq(workspaces.id, workspaceId));

  return cycleIdBySprintKey;
}

async function runImport(rows: ImportRow[]): Promise<ImportReport> {
  const { workspace, user } = await requireWorkspace();
  const data = await getWorkspaceData(
    { id: workspace.id, name: workspace.name, prefix: workspace.prefix },
    user.id
  );

  const report = emptyReport();

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

  const cycleIdBySprintKey = await ensureCyclesFromSprints(
    workspace.id,
    rows,
    report
  );

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

      // Backlog issues stay out of cycles even if Jira still lists a sprint.
      const currentSprint =
        status.type === "backlog" ? null : pickCurrentSprint(row.sprints);
      const cycleId = currentSprint
        ? (cycleIdBySprintKey.get(currentSprint.key) ?? null)
        : null;

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
          cycleId,
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
  revalidatePath("/cycles");
  return report;
}

export async function importJiraCsv(formData: FormData): Promise<ImportReport> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return emptyReport(["CSV appears to be empty"]);
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const summaryIdx = col("summary");
  if (summaryIdx === -1) {
    return emptyReport([
      'CSV is missing a "Summary" column — export issues from Jira as CSV (all fields).',
    ]);
  }
  const descIdx = col("description");
  const statusIdx = col("status");
  const priorityIdx = col("priority");
  const assigneeIdx = header.findIndex(
    (h) => h === "assignee" || h === "assignee email"
  );
  const createdIdx = col("created");
  const updatedIdx = col("updated");
  // Jira exports repeat the "Labels" / "Sprint" columns
  const labelIdxs = header
    .map((h, i) => (h === "labels" ? i : -1))
    .filter((i) => i !== -1);
  const sprintIdxs = header
    .map((h, i) => (h === "sprint" ? i : -1))
    .filter((i) => i !== -1);

  const importRows: ImportRow[] = rows.slice(1).map((r) => {
    const sprints = sprintIdxs
      .map((i) => parseJiraSprintCsvCell(r[i]))
      .filter((s): s is JiraSprint => !!s);
    // Dedupe by key while preserving order
    const seen = new Set<string>();
    const unique = sprints.filter((s) => {
      if (seen.has(s.key)) return false;
      seen.add(s.key);
      return true;
    });
    return {
      title: r[summaryIdx] ?? "",
      description: descIdx !== -1 ? (r[descIdx] ?? "") : "",
      status: statusIdx !== -1 ? (r[statusIdx] ?? "") : "",
      priority: priorityIdx !== -1 ? (r[priorityIdx] ?? "") : "",
      assignee: assigneeIdx !== -1 ? (r[assigneeIdx] ?? "") : "",
      labels: labelIdxs.map((i) => r[i] ?? "").filter(Boolean),
      sprints: unique,
      createdAt: createdIdx !== -1 ? parseJiraDate(r[createdIdx]) : undefined,
      updatedAt: updatedIdx !== -1 ? parseJiraDate(r[updatedIdx]) : undefined,
    };
  });

  return runImport(importRows);
}

type JiraApiIssue = {
  fields: Record<string, unknown> & {
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

async function findSprintFieldId(
  base: string,
  authHeader: string
): Promise<string | null> {
  const res = await fetch(`${base}/rest/api/3/field`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  if (!res.ok || !res.headers.get("content-type")?.includes("json")) {
    return null;
  }
  const fields = (await res.json()) as {
    id?: string;
    name?: string;
    schema?: { custom?: string; type?: string };
  }[];
  const sprint = fields.find(
    (f) =>
      f.schema?.custom === "com.pyxis.greenhopper.jira:gh-sprint" ||
      f.name === "Sprint"
  );
  return sprint?.id ?? null;
}

export async function importJiraApi(input: {
  siteUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}): Promise<ImportReport> {
  await requireWorkspace();

  // Users often paste a full board/project URL — reduce it to the site origin,
  // which is where Jira Cloud's REST API lives.
  const raw = input.siteUrl.trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let base: string;
  try {
    base = new URL(withScheme).origin;
  } catch {
    throw new Error(
      "Invalid Jira site URL — use your site root, e.g. https://your-team.atlassian.net"
    );
  }
  const authHeader = `Basic ${Buffer.from(`${input.email}:${input.apiToken}`).toString("base64")}`;

  // Jira answers many endpoints as an anonymous user when credentials are bad
  // (empty results instead of errors), so verify auth explicitly up front.
  const me = await fetch(`${base}/rest/api/3/myself`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  if (!me.ok) {
    throw new Error(
      me.status === 401
        ? "Jira rejected the credentials — check that the email matches your Atlassian account and generate a fresh API token at id.atlassian.com."
        : `Jira auth check failed with status ${me.status}.`
    );
  }
  const sprintFieldId = await findSprintFieldId(base, authHeader);
  const fieldList = [
    "summary",
    "description",
    "status",
    "priority",
    "assignee",
    "labels",
    "created",
    "updated",
    ...(sprintFieldId ? [sprintFieldId] : []),
  ].join(",");

  const all: JiraApiIssue[] = [];
  let nextPageToken: string | undefined;

  for (let page = 0; page < 40; page++) {
    const params = new URLSearchParams({
      jql: `project = ${input.projectKey} ORDER BY created ASC`,
      maxResults: "100",
      fields: fieldList,
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
    if (!res.headers.get("content-type")?.includes("json")) {
      throw new Error(
        `Jira returned an unexpected response from ${base} — check that the site URL is your Jira site root (e.g. https://your-team.atlassian.net).`
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

  const rows: ImportRow[] = all.map((i) => {
    const sprintValue = sprintFieldId ? i.fields[sprintFieldId] : undefined;
    return {
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
      sprints: parseJiraSprintField(sprintValue),
      createdAt: parseJiraDate(i.fields.created),
      updatedAt: parseJiraDate(i.fields.updated),
    };
  });

  return runImport(rows);
}
