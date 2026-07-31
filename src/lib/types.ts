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
