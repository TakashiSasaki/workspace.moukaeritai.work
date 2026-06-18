export interface Dashboard {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color?: string; // Hex or tailwind color class
  icon?: string;  // lucide icon name
  sortOrder: number;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardRepoBinding {
  id: string;
  dashboardId: string;
  provider: "github";
  owner: string;
  repo: string;
  defaultBranch: string;
  workingBranch?: string;
  role: "primary" | "frontend" | "backend" | "spec" | "docs" | "misc";
  createdAt: string;
  updatedAt: string;
}

export interface DashboardJulesBinding {
  id: string;
  dashboardId: string;
  sourceName?: string;
  defaultStartingBranch?: string;
  requirePlanApproval: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardChatGptLink {
  id: string;
  dashboardId: string;
  title: string;
  url: string;
  urlType: "private_conversation" | "shared_link";
  kind: "design" | "debugging" | "jules_prompting" | "specification" | "review" | "misc";
  description?: string;
  pinned: boolean;
  lastOpenedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  dashboardId: string;
  source: "github" | "jules" | "chatgpt_link" | "user" | "system";
  kind:
    | "branch_head_changed"
    | "pull_request_opened"
    | "pull_request_updated"
    | "issue_comment_created"
    | "review_comment_created"
    | "reaction_created"
    | "workflow_run_started"
    | "workflow_run_failed"
    | "workflow_run_succeeded"
    | "check_run_failed"
    | "check_run_succeeded"
    | "commit_status_failed"
    | "commit_status_succeeded"
    | "jules_activity"
    | "jules_plan_required"
    | "jules_message_sent"
    | "chatgpt_link_opened"
    | "system_sync_error";
  severity: "info" | "success" | "warning" | "error";
  requiresUserAction: boolean;
  title: string;
  body?: string;
  externalUrl?: string;
  rawPayload?: any;
  createdAt: string;
}

export interface TimelineEventAnalysis {
  id: string;
  eventId: string;
  provider: "gemini";
  model: string;
  summary?: string;
  classification?: string;
  suggestedAction?: string;
  confidence?: number;
  status: "pending" | "completed" | "failed" | "skipped";
  errorMessage?: string;
  inputHash: string;
  createdAt: string;
  updatedAt: string;
}

// Stats tracking for dashboard tabs
export interface DashboardBadgeStats {
  unreadCount: number;
  actionRequiredCount: number;
  errorCount: number;
  runningCount: number;
  latestActivityAt?: string;
  latestReadAt?: string;
}

// Jules Sessions & Activities
export interface JulesSession {
  id: string;
  dashboardId: string;
  name: string;
  status: "idle" | "running" | "waiting_for_approval" | "completed" | "failed" | "working" | "archived";
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  creatorWebUrl?: string;
}

export interface JulesActivity {
  id: string;
  sessionId: string;
  type: "user_message" | "jules_response" | "system_log";
  text: string;
  planDetails?: string;
  createdAt: string;
}
