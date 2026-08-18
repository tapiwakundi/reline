/* Dev-only seed: gives the first user a workspace with sample data. */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  cycles,
  issueLabels,
  issues,
  labels,
  memberships,
  statuses,
  user,
  workspaces,
} from "../src/db/schema";
import { DEFAULT_STATUSES, LABEL_COLORS } from "../src/lib/defaults";

async function main() {
  const u = await db.query.user.findFirst();
  if (!u) throw new Error("Sign up a user first");

  const existing = await db.query.memberships.findFirst({
    where: eq(memberships.userId, u.id),
  });
  if (existing) {
    console.log("User already has a workspace, skipping");
    return;
  }

  const [ws] = await db
    .insert(workspaces)
    .values({ name: "Endurance Labs", slug: "endurance-labs", prefix: "END" })
    .returning();

  await db
    .insert(memberships)
    .values({ workspaceId: ws.id, userId: u.id, role: "owner" });

  const statusRows = await db
    .insert(statuses)
    .values(DEFAULT_STATUSES.map((s) => ({ ...s, workspaceId: ws.id })))
    .returning();

  const labelRows = await db
    .insert(labels)
    .values(
      ["Bug", "Feature", "Design", "Infra"].map((name, i) => ({
        workspaceId: ws.id,
        name,
        color: LABEL_COLORS[i % LABEL_COLORS.length],
      }))
    )
    .returning();

  const [cycle] = await db
    .insert(cycles)
    .values({
      workspaceId: ws.id,
      number: 1,
      name: "Cycle 1",
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 86400_000),
      status: "active",
    })
    .returning();

  const byType = Object.fromEntries(statusRows.map((s) => [s.type, s.id]));
  const sample: {
    title: string;
    statusType: string;
    issueType: "story" | "task" | "bug";
    priority: number;
    label: string;
    cycle: boolean;
  }[] = [
    { title: "Set up CI pipeline", statusType: "started", issueType: "task", priority: 2, label: "Infra", cycle: true },
    { title: "Fix login redirect loop on Safari", statusType: "unstarted", issueType: "bug", priority: 1, label: "Bug", cycle: true },
    { title: "Design onboarding empty states", statusType: "unstarted", issueType: "story", priority: 3, label: "Design", cycle: false },
    { title: "Add dark mode toggle", statusType: "backlog", issueType: "story", priority: 4, label: "Feature", cycle: false },
    { title: "Migrate images to object storage", statusType: "backlog", issueType: "task", priority: 3, label: "Infra", cycle: false },
    { title: "Write API docs for webhooks", statusType: "done", issueType: "task", priority: 3, label: "Feature", cycle: true },
  ];

  let counter = 0;
  for (const s of sample) {
    counter++;
    const [issue] = await db
      .insert(issues)
      .values({
        workspaceId: ws.id,
        number: counter,
        title: s.title,
        description: "",
        type: s.issueType,
        priority: s.priority,
        statusId: byType[s.statusType],
        assigneeId: counter % 2 === 0 ? u.id : null,
        creatorId: u.id,
        cycleId: s.cycle ? cycle.id : null,
        boardOrder: counter * 1000,
      })
      .returning();
    const label = labelRows.find((l) => l.name === s.label);
    if (label) {
      await db.insert(issueLabels).values({ issueId: issue.id, labelId: label.id });
    }
  }

  await db
    .update(workspaces)
    .set({ issueCounter: counter, cycleCounter: 1 })
    .where(eq(workspaces.id, ws.id));

  console.log(`Seeded workspace "${ws.name}" with ${counter} issues`);
}

main().then(() => process.exit(0));
