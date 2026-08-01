import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nanoid } from "nanoid";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => nanoid());

// ---------- Better Auth tables ----------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
});

// ---------- Domain tables ----------

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  // URL segment, e.g. "acme-corp" -> /acme-corp/board
  slug: text("slug").notNull().unique(),
  // Issue identifier prefix, e.g. "REL" -> REL-123
  prefix: text("prefix").notNull().default("REL"),
  issueCounter: integer("issue_counter").notNull().default(0),
  cycleCounter: integer("cycle_counter").notNull().default(0),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    // Personal board display prefs (columns, completed window, card props, …)
    boardDisplay: jsonb("board_display"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("memberships_ws_user_idx").on(t.workspaceId, t.userId)]
);

export const invites = pgTable("invites", {
  id: id(),
  token: text("token")
    .notNull()
    .unique()
    .$defaultFn(() => nanoid(24)),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  usedBy: text("used_by").references(() => user.id),
});

export type StatusType =
  | "backlog"
  | "unstarted"
  | "started"
  | "done"
  | "canceled";

export const statuses = pgTable(
  "statuses",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["backlog", "unstarted", "started", "done", "canceled"],
    }).notNull(),
    color: text("color").notNull(),
    position: doublePrecision("position").notNull(),
  },
  (t) => [index("statuses_ws_idx").on(t.workspaceId)]
);

export const cycles = pgTable(
  "cycles",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    status: text("status", { enum: ["planned", "active", "completed"] })
      .notNull()
      .default("planned"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("cycles_ws_idx").on(t.workspaceId)]
);

export const issues = pgTable(
  "issues",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    // 0 none, 1 urgent, 2 high, 3 medium, 4 low
    priority: integer("priority").notNull().default(0),
    statusId: text("status_id")
      .notNull()
      .references(() => statuses.id),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    creatorId: text("creator_id").references(() => user.id, {
      onDelete: "set null",
    }),
    cycleId: text("cycle_id").references(() => cycles.id, {
      onDelete: "set null",
    }),
    estimate: integer("estimate"),
    boardOrder: doublePrecision("board_order").notNull().default(0),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("issues_ws_number_idx").on(t.workspaceId, t.number),
    index("issues_status_idx").on(t.statusId),
    index("issues_assignee_idx").on(t.assigneeId),
    index("issues_cycle_idx").on(t.cycleId),
  ]
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (t) => [uniqueIndex("labels_ws_name_idx").on(t.workspaceId, t.name)]
);

export const issueLabels = pgTable(
  "issue_labels",
  {
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.labelId] })]
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Set when the comment is a reply to another (top-level) comment
    parentId: text("parent_id").references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    index("comments_issue_idx").on(t.issueId),
    index("comments_parent_idx").on(t.parentId),
  ]
);

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    // null = attached directly to the issue; set = attached to a comment
    commentId: text("comment_id").references(() => comments.id, {
      onDelete: "cascade",
    }),
    uploaderId: text("uploader_id").references(() => user.id, {
      onDelete: "set null",
    }),
    key: text("key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    index("attachments_issue_idx").on(t.issueId),
    index("attachments_comment_idx").on(t.commentId),
  ]
);

export type NotificationType =
  | "assigned"
  | "commented"
  | "status_changed"
  | "mentioned";

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: ["assigned", "commented", "status_changed", "mentioned"],
    }).notNull(),
    payload: jsonb("payload").$type<Record<string, string>>(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)]
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, string | null>>(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("activities_issue_idx").on(t.issueId)]
);

// ---------- Relations ----------

export const issuesRelations = relations(issues, ({ one, many }) => ({
  status: one(statuses, { fields: [issues.statusId], references: [statuses.id] }),
  assignee: one(user, { fields: [issues.assigneeId], references: [user.id] }),
  creator: one(user, { fields: [issues.creatorId], references: [user.id] }),
  cycle: one(cycles, { fields: [issues.cycleId], references: [cycles.id] }),
  workspace: one(workspaces, {
    fields: [issues.workspaceId],
    references: [workspaces.id],
  }),
  labels: many(issueLabels),
  comments: many(comments),
  activities: many(activities),
  attachments: many(attachments),
}));

export const issueLabelsRelations = relations(issueLabels, ({ one }) => ({
  issue: one(issues, { fields: [issueLabels.issueId], references: [issues.id] }),
  label: one(labels, { fields: [issueLabels.labelId], references: [labels.id] }),
}));

export const labelsRelations = relations(labels, ({ many }) => ({
  issues: many(issueLabels),
}));

export const statusesRelations = relations(statuses, ({ many }) => ({
  issues: many(issues),
}));

export const cyclesRelations = relations(cycles, ({ many }) => ({
  issues: many(issues),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  issue: one(issues, { fields: [comments.issueId], references: [issues.id] }),
  author: one(user, { fields: [comments.authorId], references: [user.id] }),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  issue: one(issues, {
    fields: [attachments.issueId],
    references: [issues.id],
  }),
  comment: one(comments, {
    fields: [attachments.commentId],
    references: [comments.id],
  }),
  uploader: one(user, {
    fields: [attachments.uploaderId],
    references: [user.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  issue: one(issues, { fields: [activities.issueId], references: [issues.id] }),
  actor: one(user, { fields: [activities.actorId], references: [user.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  issue: one(issues, {
    fields: [notifications.issueId],
    references: [issues.id],
  }),
  actor: one(user, { fields: [notifications.actorId], references: [user.id] }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(user, { fields: [memberships.userId], references: [user.id] }),
  workspace: one(workspaces, {
    fields: [memberships.workspaceId],
    references: [workspaces.id],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  memberships: many(memberships),
  statuses: many(statuses),
  issues: many(issues),
  labels: many(labels),
  cycles: many(cycles),
}));

export const userRelations = relations(user, ({ many }) => ({
  memberships: many(memberships),
}));
