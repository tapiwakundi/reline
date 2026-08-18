export const DEFAULT_STATUSES: {
  name: string;
  type: "backlog" | "unstarted" | "started" | "done" | "canceled";
  color: string;
  position: number;
}[] = [
  { name: "Backlog", type: "backlog", color: "#95a2b3", position: 0 },
  { name: "Todo", type: "unstarted", color: "#e2e2e2", position: 1 },
  { name: "In Progress", type: "started", color: "#f2c94c", position: 2 },
  { name: "Done", type: "done", color: "#5e6ad2", position: 3 },
  { name: "Canceled", type: "canceled", color: "#95a2b3", position: 4 },
];

export const LABEL_COLORS = [
  "#5e6ad2",
  "#26b5ce",
  "#4cb782",
  "#f2c94c",
  "#f2994a",
  "#f7658b",
  "#b59aeb",
  "#95a2b3",
];

export const PRIORITIES = [
  { value: 0, label: "No priority" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
] as const;

export const ISSUE_TYPES = [
  { value: "story", label: "Story" },
  { value: "task", label: "Task" },
  { value: "bug", label: "Bug" },
] as const;
