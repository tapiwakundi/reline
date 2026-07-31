export type Member = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type StatusRow = {
  id: string;
  name: string;
  type: "backlog" | "unstarted" | "started" | "done" | "canceled";
  color: string;
  position: number;
};

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

export type WorkspaceData = {
  workspace: { id: string; name: string; prefix: string };
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
  priority: number;
  statusId: string;
  assigneeId: string | null;
  cycleId: string | null;
  labelIds: string[];
  createdAt: string;
  attachments: SavedAttachment[];
};

export type CommentItem = {
  id: string;
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
    createdAt: string;
  };
  role: string;
  members: Member[];
  labels: LabelRow[];
};
