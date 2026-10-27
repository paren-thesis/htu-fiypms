export type TopicStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "revision_requested"
  | "rejected";

export type ChapterStatus =
  | "pending"
  | "approved"
  | "revision_needed";

export type TeamStatus =
  | "formation"
  | "topic_pending"
  | "topic_approved"
  | "defense_ready"
  | "completed"
  | "disbanded";

export type DefenseStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type ConflictStatus =
  | "warning"
  | "danger";

export type SupervisionStatus =
  | "available"
  | "at_capacity"
  | "proposed"
  | "accepted"
  | "declined"
  | "expired"
  | "not_assigned";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

export type StatusDomainMap = {
  topic: TopicStatus;
  chapter: ChapterStatus;
  team: TeamStatus;
  defense: DefenseStatus;
  conflict: ConflictStatus;
  supervision: SupervisionStatus;
};

export type StatusDomain = keyof StatusDomainMap;

export interface StatusConfig {
  label: string;
  tone: BadgeTone;
  iconType: "circle" | "clock" | "check" | "alert" | "x" | "pulse" | "shield" | "flag";
}

export const TOPIC_STATUS_CONFIG: Record<TopicStatus, StatusConfig> = {
  draft: { label: "Draft", tone: "neutral", iconType: "circle" },
  submitted: { label: "Submitted", tone: "info", iconType: "circle" },
  under_review: { label: "Under Review", tone: "info", iconType: "clock" },
  approved: { label: "Approved", tone: "success", iconType: "check" },
  revision_requested: { label: "Revision Requested", tone: "warning", iconType: "alert" },
  rejected: { label: "Rejected", tone: "danger", iconType: "x" },
};

export const CHAPTER_STATUS_CONFIG: Record<ChapterStatus, StatusConfig> = {
  pending: { label: "Pending", tone: "neutral", iconType: "clock" },
  approved: { label: "Approved", tone: "success", iconType: "check" },
  revision_needed: { label: "Revision Needed", tone: "warning", iconType: "alert" },
};

export const TEAM_STATUS_CONFIG: Record<TeamStatus, StatusConfig> = {
  formation: { label: "Formation", tone: "neutral", iconType: "circle" },
  topic_pending: { label: "Topic Pending", tone: "info", iconType: "clock" },
  topic_approved: { label: "Topic Approved", tone: "success", iconType: "check" },
  defense_ready: { label: "Defense Ready", tone: "primary", iconType: "flag" },
  completed: { label: "Completed", tone: "success", iconType: "check" },
  disbanded: { label: "Disbanded", tone: "danger", iconType: "x" },
};

export const DEFENSE_STATUS_CONFIG: Record<DefenseStatus, StatusConfig> = {
  scheduled: { label: "Scheduled", tone: "neutral", iconType: "circle" },
  in_progress: { label: "In Progress", tone: "info", iconType: "pulse" },
  completed: { label: "Completed", tone: "success", iconType: "check" },
  cancelled: { label: "Cancelled", tone: "danger", iconType: "x" },
};

export const CONFLICT_STATUS_CONFIG: Record<ConflictStatus, StatusConfig> = {
  warning: { label: "Schedule Conflict", tone: "warning", iconType: "alert" },
  danger: { label: "Direct Conflict", tone: "danger", iconType: "alert" },
};

export const SUPERVISION_STATUS_CONFIG: Record<SupervisionStatus, StatusConfig> = {
  available: { label: "Available", tone: "success", iconType: "check" },
  at_capacity: { label: "At Capacity", tone: "danger", iconType: "alert" },
  proposed: { label: "Proposed", tone: "info", iconType: "clock" },
  accepted: { label: "Accepted", tone: "success", iconType: "check" },
  declined: { label: "Declined", tone: "danger", iconType: "x" },
  expired: { label: "Expired", tone: "warning", iconType: "clock" },
  not_assigned: { label: "Not Assigned", tone: "neutral", iconType: "circle" },
};

export function getStatusConfig<D extends StatusDomain>(
  domain: D,
  value: StatusDomainMap[D]
): StatusConfig {
  switch (domain) {
    case "topic":
      return TOPIC_STATUS_CONFIG[value as TopicStatus];
    case "chapter":
      return CHAPTER_STATUS_CONFIG[value as ChapterStatus];
    case "team":
      return TEAM_STATUS_CONFIG[value as TeamStatus];
    case "defense":
      return DEFENSE_STATUS_CONFIG[value as DefenseStatus];
    case "conflict":
      return CONFLICT_STATUS_CONFIG[value as ConflictStatus];
    case "supervision":
      return SUPERVISION_STATUS_CONFIG[value as SupervisionStatus];
    default:
      return { label: String(value), tone: "neutral", iconType: "circle" };
  }
}
