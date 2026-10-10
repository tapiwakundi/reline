export type Member = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type WorkspaceRole = "owner" | "member";

export type WorkspaceMember = Member & {
  role: WorkspaceRole;
};

export type StatusRow = {
  id: string;
  name: string;
  type: "backlog" | "unstarted" | "started" | "done" | "canceled";
  color: string;
  position: number;
};

export type IssueType = "story" | "task" | "bug";

export type LabelRow = {
  id: string;
  name: string;
  color: string;
};

export type CycleRow = {
  id: string;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "completed";
};

export type IssueListItem = {
  id: string;
  identifier: string;
  number: number;
  title: string;
  type: IssueType;
  priority: number;
  statusId: string;
  assigneeId: string | null;
  cycleId: string | null;
  estimate: number | null;
  boardOrder: number;
  createdAt: string;
  updatedAt: string;
  labelIds: string[];
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  prefix: string;
  logo: string | null;
  cycleName: string | null;
};

export type WorkspaceData = {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  me: Member;
  members: Member[];
  statuses: StatusRow[];
  labels: LabelRow[];
  cycles: CycleRow[];
};

export type SavedAttachment = {
  id: string;
  url: string;
  filename: string;
  kind: "image" | "video";
};

export type DetailIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  type: IssueType;
  priority: number;
  statusId: string;
  assigneeId: string | null;
  creator: Member | null;
  cycleId: string | null;
  labelIds: string[];
  createdAt: string;
  attachments: SavedAttachment[];
};

export type CommentItem = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  author: Member | null;
  attachments: SavedAttachment[];
};

export type ActivityItem = {
  id: string;
  type: string;
  data: Record<string, string | null>;
  createdAt: string;
  actor: Member | null;
};

export type IssueDetailData = {
  issue: DetailIssue;
  comments: CommentItem[];
  activities: ActivityItem[];
};

export type CycleListItem = {
  id: string;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "completed";
  total: number;
  done: number;
  started: number;
  /** Backlog + Todo (unstarted) issues still on this cycle. */
  pending: number;
  estimateTotal: number;
  estimateDone: number;
};

export type InboxItem = {
  id: string;
  type: string;
  payload: Record<string, string>;
  readAt: string | null;
  createdAt: string;
  issue: { identifier: string; title: string };
  actor: Member | null;
};

export type WorkspaceSettings = {
  workspace: {
    id: string;
    name: string;
    prefix: string;
    logo: string | null;
    cycleName: string | null;
    createdAt: string;
  };
  role: string;
  members: WorkspaceMember[];
  labels: LabelRow[];
};

export type WorkspaceListItem = {
  id: string;
  name: string;
  slug: string;
  prefix: string;
  logo: string | null;
  cycleName: string | null;
};

export type AttachmentInput = {
  key: string;
  filename: string;
  contentType: string;
  size: number;
};

export type IssueUpdatePatch = {
  title?: string;
  description?: string;
  statusId?: string;
  priority?: number;
  type?: IssueType;
  assigneeId?: string | null;
  cycleId?: string | null;
  estimate?: number | null;
  labelIds?: string[];
};

export type BoardMoveTarget =
  | { kind: "status"; statusId: string }
  | { kind: "assignee"; assigneeId: string | null }
  | { kind: "priority"; priority: number }
  | { kind: "cycle"; cycleId: string | null };

export type CycleIssueDisposition = "next" | "backlog" | "keep";

export type ImportReport = {
  created: number;
  skipped: number;
  createdLabels: string[];
  createdCycles: string[];
  unmatchedAssignees: string[];
  errors: string[];
};

export type MeResponse = {
  user: Member;
  workspaces: WorkspaceListItem[];
  homePath: string;
};

export type MembershipSummary = {
  id: string;
  role: string;
  boardDisplay: unknown;
};

export type WorkspaceBootstrap = WorkspaceData & {
  unread: number;
  membership: MembershipSummary;
};

export type InvitePreview = {
  valid: boolean;
  workspaceName: string | null;
};
