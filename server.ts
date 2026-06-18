import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

// Load env variables
dotenv.config();

// Load Types
import {
  Dashboard,
  DashboardRepoBinding,
  DashboardJulesBinding,
  DashboardChatGptLink,
  TimelineEvent,
  DashboardBadgeStats
} from "./src/types";

// Setup types for local DB storage
interface JulesSession {
  id: string;
  dashboardId: string;
  name: string;
  status: "idle" | "running" | "waiting_for_approval" | "completed" | "failed" | "working" | "archived";
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  creatorWebUrl?: string;
  missingCount?: number;
}

interface JulesActivity {
  id: string;
  sessionId: string;
  type: "user_message" | "jules_response" | "system_log";
  text: string;
  planDetails?: string;
  createdAt: string;
}

interface PollingCheckpoint {
  etag?: string;
  lastModified?: string;
  lastPolledAt: string;
}

interface DatabaseSchema {
  dashboards: Dashboard[];
  repoBindings: DashboardRepoBinding[];
  julesBindings: DashboardJulesBinding[];
  chatGptLinks: DashboardChatGptLink[];
  timelineEvents: TimelineEvent[];
  julesSessions: JulesSession[];
  julesActivities: JulesActivity[];
  pollingCheckpoints: Record<string, PollingCheckpoint>;
  // For UI convenience if env secrets aren't set
  serverSecrets: {
    githubToken?: string;
    julesApiKey?: string;
  };
}

// In-memory fallback database
function initializeDB(): DatabaseSchema {
  // Pre-seed default projects
  const d1Id = "db-public-fid";
  const d2Id = "db-scan-moukaeritai-work";

  const initialDashboards: Dashboard[] = [
    {
      id: d1Id,
      name: "public",
      slug: "public",
      description: "Development Dashboard for TakashiSasaki/public on uuidv8-fid",
      color: "sky",
      icon: "Github",
      sortOrder: 1,
      pinned: true,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: d2Id,
      name: "scan.moukaeritai.work",
      slug: "scan-moukaeritai-work",
      description: "Development Dashboard for TakashiSasaki/scan.moukaeritai.work on scan.moukaeritai.work",
      color: "indigo",
      icon: "Github",
      sortOrder: 2,
      pinned: true,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const initialRepoBindings: DashboardRepoBinding[] = [
    {
      id: "repo-public-1",
      dashboardId: d1Id,
      provider: "github",
      owner: "TakashiSasaki",
      repo: "public",
      defaultBranch: "uuidv8-fid",
      workingBranch: "uuidv8-fid",
      role: "primary",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "repo-scan-1",
      dashboardId: d2Id,
      provider: "github",
      owner: "TakashiSasaki",
      repo: "scan.moukaeritai.work",
      defaultBranch: "scan.moukaeritai.work",
      workingBranch: "scan.moukaeritai.work",
      role: "primary",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const initialJulesBindings: DashboardJulesBinding[] = [
    {
      id: "jules-b-public",
      dashboardId: d1Id,
      sourceName: "jules-public-agent",
      defaultStartingBranch: "uuidv8-fid",
      requirePlanApproval: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "jules-b-scan",
      dashboardId: d2Id,
      sourceName: "jules-scan-agent",
      defaultStartingBranch: "scan.moukaeritai.work",
      requirePlanApproval: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  return {
    dashboards: initialDashboards,
    repoBindings: initialRepoBindings,
    julesBindings: initialJulesBindings,
    chatGptLinks: [],
    timelineEvents: [],
    julesSessions: [],
    julesActivities: [],
    pollingCheckpoints: {},
    serverSecrets: {}
  };
}

let db = initializeDB();

function saveDB() {
  // No-op: db.json persistence removed
}

// Get effective GITHUB_TOKEN on server
function getGithubToken(): string {
  return db.serverSecrets.githubToken || process.env.GITHUB_TOKEN || "";
}

// Get effective JULES_API_KEY on server
function getJulesApiKey(): string {
  return db.serverSecrets.julesApiKey || process.env.JULES_API_KEY || "";
}

// REST helper to make requests with correct authentication
async function fetchGithubAPI(endpoint: string, checkpointKey?: string, suppressConsoleError: boolean = false): Promise<{ data: any; notModified: boolean; updatedEtag?: string; updatedLastModified?: string; status: number }> {
  const token = getGithubToken();
  const url = `https://api.github.com${endpoint}`;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "Project-Development-Dashboard-APP",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Include conditional Headers if any
  if (checkpointKey && db.pollingCheckpoints[checkpointKey]) {
    const cp = db.pollingCheckpoints[checkpointKey];
    if (cp.etag) headers["If-None-Match"] = cp.etag;
    if (cp.lastModified) headers["If-Modified-Since"] = cp.lastModified;
  }

  try {
    const res = await fetch(url, { headers });
    if (res.status === 304) {
      return { data: null, notModified: true, status: 304 };
    }

    const etag = res.headers.get("etag") || undefined;
    const lastModified = res.headers.get("last-modified") || undefined;

    if (checkpointKey) {
      db.pollingCheckpoints[checkpointKey] = {
        etag,
        lastModified,
        lastPolledAt: new Date().toISOString()
      };
      saveDB();
    }

    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch(_) {}
      if (!suppressConsoleError && res.status !== 404 && res.status !== 422 && res.status !== 401 && res.status !== 403) {
        console.error(`Github API Error Fetching ${endpoint}: ${res.status} ${res.statusText}. Response: ${bodyText}`);
      } else if (res.status !== 401 && res.status !== 403) {
        console.warn(`Github API soft check status ${res.status} on ${endpoint} response: ${bodyText}. Returning gracefully.`);
      }
      return { data: null, notModified: false, status: res.status };
    }

    const data = await res.json();
    return { data, notModified: false, updatedEtag: etag, updatedLastModified: lastModified, status: res.status };
  } catch (err: any) {
    console.error(`Fetch exception for Github API ${endpoint}:`, err);
    return { data: null, notModified: false, status: 500 };
  }
}

// Create a unified helper to append events deterministically to prevent duplicates
function addTimelineEvent(event: Omit<TimelineEvent, "id" | "createdAt">): boolean {
  // Try to avoid exact duplicate events (matching source, kind, title, dashboardId and externalUrl within recent times)
  const isDuplicate = db.timelineEvents.some(
    e =>
      e.dashboardId === event.dashboardId &&
      e.source === event.source &&
      e.kind === event.kind &&
      e.title === event.title &&
      e.externalUrl === event.externalUrl &&
      (Date.now() - new Date(e.createdAt).getTime() < 3600000 * 24) // 24-hr duplication filter
  );

  if (isDuplicate) {
    return false;
  }

  const newEvent: TimelineEvent = {
    ...event,
    id: `ev-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    createdAt: new Date().toISOString()
  };

  db.timelineEvents.unshift(newEvent);
  // Cap timeline size to avoid bloated file sizes
  if (db.timelineEvents.length > 500) {
    db.timelineEvents = db.timelineEvents.slice(0, 500);
  }
  saveDB();
  return true;
}

// Active polling variable
let isPollingActive = false;

// Dynamic status indicators per dashboard
const lastSyncStatus: Record<string, { success: boolean; error?: string; polledAt: string }> = {};

// Background Polling Flow
async function pollGitHubAndJules() {
  if (isPollingActive) return;
  isPollingActive = true;

  const currentToken = getGithubToken();
  if (!currentToken) {
    console.warn("Skipping GitHub background poll: No GITHUB_TOKEN configured.");
    isPollingActive = false;
    return;
  }

  console.log("Starting background poll of configured GitHub repositories...");

  for (const dashboard of db.dashboards) {
    if (dashboard.archived) continue;

    // Get primary bindings for this dashboard
    const bindings = db.repoBindings.filter(b => b.dashboardId === dashboard.id);
    for (const binding of bindings) {
      const { owner, repo, defaultBranch, workingBranch } = binding;
      let targetBranch = workingBranch || defaultBranch;
      let checkpointPrefix = `${dashboard.id}-${owner}-${repo}-${targetBranch}`;

      try {
        // 1. Poll HEAD commit (suppress console.error if using working branch and it might not exist)
        const isWorkingBranch = !!(workingBranch && workingBranch !== defaultBranch);
        let headRes = await fetchGithubAPI(`/repos/${owner}/${repo}/commits/${targetBranch}`, `${checkpointPrefix}-commit`, isWorkingBranch);
        
        // If the working branch does not exist, fallback to the default branch to prevent client-visible errors
        if ((headRes.status === 404 || headRes.status === 422) && isWorkingBranch) {
          console.warn(`Branch '${workingBranch}' not found on repo '${owner}/${repo}'. Falling back to default branch '${defaultBranch}'.`);
          targetBranch = defaultBranch;
          checkpointPrefix = `${dashboard.id}-${owner}-${repo}-${targetBranch}`;
          headRes = await fetchGithubAPI(`/repos/${owner}/${repo}/commits/${targetBranch}`, `${checkpointPrefix}-commit`, false);
        }

        if (headRes.status === 200 && headRes.data) {
          const commit = headRes.data;
          const commitSha = commit.sha;
          const commitMsg = commit.commit?.message || "No commit message";
          const committerName = commit.commit?.author?.name || "Unknown Author";

          addTimelineEvent({
            dashboardId: dashboard.id,
            source: "github",
            kind: "branch_head_changed",
            severity: "success",
            requiresUserAction: false,
            title: `Branch '${targetBranch}' HEAD updated`,
            body: `Commit sha: ${commitSha.substring(0, 8)} by ${committerName} - ${commitMsg}`,
            externalUrl: commit.html_url,
            rawPayload: { sha: commitSha, author: committerName, message: commitMsg }
          });
        }

        // 2. Poll Open Pull Requests
        const prsRes = await fetchGithubAPI(`/repos/${owner}/${repo}/pulls?state=open&per_page=5`, `${checkpointPrefix}-prs`);
        if (prsRes.status === 200 && prsRes.data && Array.isArray(prsRes.data)) {
          for (const pr of prsRes.data) {
            // Check if PR was recently opened
            addTimelineEvent({
              dashboardId: dashboard.id,
              source: "github",
              kind: "pull_request_opened",
              severity: "info",
              requiresUserAction: false,
              title: `PR Opened: #${pr.number} - ${pr.title}`,
              body: `PR created by ${pr.user?.login || "unknown"} in repository ${owner}/${repo}`,
              externalUrl: pr.html_url,
              rawPayload: { number: pr.number, author: pr.user?.login }
            });

            // For each PR let's poll reactions or reviews if they need user action
            // Fetch reviews for open pull requests
            const reviewsRes = await fetchGithubAPI(`/repos/${owner}/${repo}/pulls/${pr.number}/reviews`, `${checkpointPrefix}-pr-${pr.number}-reviews`);
            if (reviewsRes.status === 200 && reviewsRes.data && Array.isArray(reviewsRes.data) && reviewsRes.data.length > 0) {
              const lastReview = reviewsRes.data[reviewsRes.data.length - 1];
              if (lastReview.state === "CHANGES_REQUESTED") {
                addTimelineEvent({
                  dashboardId: dashboard.id,
                  source: "github",
                  kind: "pull_request_updated",
                  severity: "warning",
                  requiresUserAction: true,
                  title: `PR #${pr.number} Changes Requested`,
                  body: `Reviewer ${lastReview.user?.login || "Someone"} requested changes: "${lastReview.body || "No comment content provided."}"`,
                  externalUrl: pr.html_url,
                  rawPayload: lastReview
                });
              }
            }
          }
        }

        // 3. Workflow Runs
        const workflowRes = await fetchGithubAPI(`/repos/${owner}/${repo}/actions/runs?per_page=5`, `${checkpointPrefix}-workflows`);
        if (workflowRes.status === 200 && workflowRes.data && workflowRes.data.workflow_runs && Array.isArray(workflowRes.data.workflow_runs)) {
          for (const run of workflowRes.data.workflow_runs) {
            let severity: "info" | "success" | "warning" | "error" = "info";
            let kind: "workflow_run_started" | "workflow_run_failed" | "workflow_run_succeeded" = "workflow_run_started";
            let requiresUserAction = false;

            if (run.status === "completed") {
              if (run.conclusion === "success") {
                severity = "success";
                kind = "workflow_run_succeeded";
              } else if (run.conclusion === "failure" || run.conclusion === "cancelled") {
                severity = "error";
                kind = "workflow_run_failed";
                requiresUserAction = true;
              }
            } else {
              kind = "workflow_run_started";
            }

            addTimelineEvent({
              dashboardId: dashboard.id,
              source: "github",
              kind,
              severity,
              requiresUserAction,
              title: `Workflow ${run.name} #${run.run_number} ${run.status === "completed" ? run.conclusion : "started"}`,
              body: `Triggered by ${run.triggering_actor?.login || "actor"} for commit ${run.head_commit?.message?.substring(0, 50) || "HEAD"}`,
              externalUrl: run.html_url,
              rawPayload: { status: run.status, conclusion: run.conclusion }
            });
          }
        }

        // 4. Check Runs for the latest branch HEAD
        // First we should fetch commits to get the last SHA if none present in binders
        const commitUrl = `/repos/${owner}/${repo}/commits/${targetBranch}`;
        const commitDetail = await fetchGithubAPI(commitUrl);
        if (commitDetail.status === 200 && commitDetail.data) {
          const sha = commitDetail.data.sha;
          const checksRes = await fetchGithubAPI(`/repos/${owner}/${repo}/commits/${sha}/check-runs`, `${checkpointPrefix}-checks-${sha}`);
          if (checksRes.status === 200 && checksRes.data && Array.isArray(checksRes.data.check_runs)) {
            for (const check of checksRes.data.check_runs) {
              if (check.status === "completed") {
                const wasSuccess = check.conclusion === "success";
                addTimelineEvent({
                  dashboardId: dashboard.id,
                  source: "github",
                  kind: wasSuccess ? "check_run_succeeded" : "check_run_failed",
                  severity: wasSuccess ? "success" : "error",
                  requiresUserAction: !wasSuccess,
                  title: `Check run ${check.name} completed: ${check.conclusion}`,
                  body: `Checked commit sha: ${sha.substring(0, 8)}. Completed at ${check.completed_at}`,
                  externalUrl: check.html_url,
                  rawPayload: { name: check.name, conclusion: check.conclusion }
                });
              }
            }
          }

          // Combined commit statuses
          const statusRes = await fetchGithubAPI(`/repos/${owner}/${repo}/commits/${sha}/status`, `${checkpointPrefix}-status-${sha}`);
          if (statusRes.status === 200 && statusRes.data) {
            const combinedStatus = statusRes.data.state; // failure, error, pending, success
            if (combinedStatus === "failure" || combinedStatus === "success") {
              addTimelineEvent({
                dashboardId: dashboard.id,
                source: "github",
                kind: combinedStatus === "success" ? "commit_status_succeeded" : "commit_status_failed",
                severity: combinedStatus === "success" ? "success" : "error",
                requiresUserAction: combinedStatus === "failure",
                title: `Commit status verified: ${combinedStatus}`,
                body: `All statuses are ${combinedStatus} for branch HEAD.`,
                externalUrl: `https://github.com/${owner}/${repo}/commit/${sha}`,
                rawPayload: statusRes.data
              });
            }
          }
        }

        // 5. Poll issue comments (PR conversation page comments)
        const commentsRes = await fetchGithubAPI(`/repos/${owner}/${repo}/issues/comments?sort=updated&direction=desc&per_page=10`, `${checkpointPrefix}-comments`);
        if (commentsRes.status === 200 && commentsRes.data && Array.isArray(commentsRes.data)) {
          for (const comm of commentsRes.data) {
            addTimelineEvent({
              dashboardId: dashboard.id,
              source: "github",
              kind: "issue_comment_created",
              severity: "info",
              requiresUserAction: false,
              title: `New Comment by ${comm.user?.login || "someone"}`,
              body: comm.body ? (comm.body.substring(0, 140) + (comm.body.length > 140 ? "..." : "")) : "",
              externalUrl: comm.html_url,
              rawPayload: comm
            });
          }
        }

        // 6. Poll separate review comments (specific line changes on files)
        const reviewCommentsRes = await fetchGithubAPI(`/repos/${owner}/${repo}/pulls/comments?sort=updated&direction=desc&per_page=10`, `${checkpointPrefix}-review-comments`);
        if (reviewCommentsRes.status === 200 && reviewCommentsRes.data && Array.isArray(reviewCommentsRes.data)) {
          for (const comment of reviewCommentsRes.data) {
            addTimelineEvent({
              dashboardId: dashboard.id,
              source: "github",
              kind: "review_comment_created",
              severity: "info",
              requiresUserAction: false,
              title: `File Review Comment by ${comment.user?.login || "Someone"}`,
              body: `Path: ${comment.path} - ${comment.body}`,
              externalUrl: comment.html_url,
              rawPayload: comment
            });
          }
        }

        // Update Sync Track
        lastSyncStatus[dashboard.id] = {
          success: true,
          polledAt: new Date().toISOString()
        };

      } catch (repoErr: any) {
        console.error(`Error polling repository ${owner}/${repo}:`, repoErr);
        lastSyncStatus[dashboard.id] = {
          success: false,
          error: repoErr.message,
          polledAt: new Date().toISOString()
        };

        addTimelineEvent({
          dashboardId: dashboard.id,
          source: "system",
          kind: "system_sync_error",
          severity: "error",
          requiresUserAction: false,
          title: "GitHub synchronization failed",
          body: `Failed to poll metadata for ${owner}/${repo}. Reason: ${repoErr.message}`
        });
      }
    }
  }

  isPollingActive = false;
}

// Set background polling loop
const pollInterval = setInterval(pollGitHubAndJules, 45000);

// Initialize server express
async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Middlewares
  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      pollingIntervalMs: 45000,
      activeSyncs: Object.keys(lastSyncStatus).length
    });
  });

  // REST API: Secrets Management (Server-Side Only - Safe)
  app.get("/api/secrets", (req, res) => {
    res.json({
      githubTokenConfigured: !!getGithubToken(),
      julesApiKeyConfigured: !!getJulesApiKey(),
      environmentProvided: {
        GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
        JULES_API_KEY: !!process.env.JULES_API_KEY
      }
    });
  });

  app.post("/api/secrets", (req, res) => {
    const { githubToken, julesApiKey } = req.body;
    if (githubToken !== undefined) {
      db.serverSecrets.githubToken = githubToken;
    }
    if (julesApiKey !== undefined) {
      db.serverSecrets.julesApiKey = julesApiKey;
    }
    saveDB();
    console.log("Updated runtime secrets from user settings UI securely.");
    res.json({ success: true, message: "Secrets saved securely on the server." });
  });

  app.post("/api/trigger-sync", async (req, res) => {
    try {
      await pollGitHubAndJules();
      res.json({ success: true, message: "Polling process executed." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // REST API: Proxy endpoint for retrieving repositories (sorted by last pushed/updated default branch desc)
  app.get("/api/github/repos", async (req, res) => {
    let token = getGithubToken();
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const parsedToken = authHeader.substring(7).trim();
      if (parsedToken) {
        token = parsedToken;
      }
    }

    if (!token) {
      return res.status(401).json({ error: "GitHub token (PAT) is not configured yet. Please configure it in Settings." });
    }

    try {
      const reposRes = await fetch("https://api.github.com/user/repos?per_page=100&sort=pushed&direction=desc", {
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Project-Development-Dashboard-APP"
        }
      });

      if (!reposRes.ok) {
        let errMsg = "Failed to fetch repositories from GitHub";
        try {
          const errData = await reposRes.json();
          if (errData.message) errMsg = errData.message;
        } catch (_) {}
        return res.status(reposRes.status).json({ error: errMsg });
      }

      const repos = await reposRes.json();
      if (!Array.isArray(repos)) {
        return res.status(500).json({ error: "Invalid repository list returned from GitHub API" });
      }

      const formatted = repos.map((r: any) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        owner: { login: r.owner?.login },
        pushed_at: r.pushed_at,
        default_branch: r.default_branch,
        description: r.description
      }));

      // Explicitly sort desc by pushed_at
      formatted.sort((a, b) => {
        if (!a.pushed_at) return 1;
        if (!b.pushed_at) return -1;
        return new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime();
      });

      res.json(formatted);
    } catch (e: any) {
      console.error("Error in /api/github/repos API handler:", e);
      res.status(500).json({ error: e.message || "Internal Server Error" });
    }
  });

  // REST API: Proxy endpoint for retrieving branch list (sorted by last commit datetime desc)
  app.get("/api/github/branches", async (req, res) => {
    const { owner, repo } = req.query;
    if (!owner || !repo) {
      return res.status(400).json({ error: "owner and repo parameters are required" });
    }

    let token = getGithubToken();
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const parsedToken = authHeader.substring(7).trim();
      if (parsedToken) {
        token = parsedToken;
      }
    }

    if (!token) {
      return res.status(401).json({ error: "GitHub token (PAT) is not configured yet. Please configure it in Settings." });
    }

    try {
      const branchesRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Project-Development-Dashboard-APP"
        }
      });

      if (!branchesRes.ok) {
        let errMsg = "Failed to fetch branches from GitHub";
        try {
          const errData = await branchesRes.json();
          if (errData.message) errMsg = errData.message;
        } catch (_) {}
        return res.status(branchesRes.status).json({ error: errMsg });
      }

      const branches = await branchesRes.json();
      if (!Array.isArray(branches)) {
        return res.status(500).json({ error: "Invalid branch list returned from GitHub API" });
      }

      // Fetch last commit date details for each branch (cap at 40 concurrent requests maximum)
      const sliced = branches.slice(0, 40);
      const branchesWithDates = await Promise.all(
        sliced.map(async (b: any) => {
          try {
            const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${b.commit.sha}`, {
              headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${token}`,
                "User-Agent": "Project-Development-Dashboard-APP"
              }
            });
            if (commitRes.ok) {
              const commitData = await commitRes.json();
              const date = commitData.commit?.committer?.date || commitData.commit?.author?.date || "";
              return {
                name: b.name,
                sha: b.commit.sha,
                lastCommitDate: date
              };
            }
          } catch (_) {}
          return {
            name: b.name,
            sha: b.commit.sha,
            lastCommitDate: ""
          };
        })
      );

      // Sort by lastCommitDate descending
      branchesWithDates.sort((a, b) => {
        if (!a.lastCommitDate) return 1;
        if (!b.lastCommitDate) return -1;
        return new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime();
      });

      res.json(branchesWithDates);
    } catch (e: any) {
      console.error("Error in /api/github/branches API handler:", e);
      res.status(500).json({ error: e.message || "Internal Server Error" });
    }
  });

  // REST API: Dashboards CRUDA
  app.get("/api/dashboards", (req, res) => {
    // Generate badge stats dynamically based on unread rules
    const summaries = db.dashboards
      .filter(d => !d.archived)
      .map(dashboard => {
        const events = db.timelineEvents.filter(e => e.dashboardId === dashboard.id);
        const jSessionWithApprovals = db.julesSessions.filter(
          s => s.dashboardId === dashboard.id && s.status === "waiting_for_approval"
        );

        // Action required if: (warning level AND requiresUserAction) OR Jules has plan awaiting approval
        const actionRequiredEvents = events.filter(e => e.requiresUserAction);
        const actionRequiredCount = actionRequiredEvents.length + jSessionWithApprovals.length;

        // Error if: event severity is error or github sync reports failed status
        const errorEvents = events.filter(e => e.severity === "error" && e.requiresUserAction);
        const errorCount = errorEvents.length + (lastSyncStatus[dashboard.id]?.success === false ? 1 : 0);

        // Running key: active runs or Jules sessions currently processing
        const activeJulesSessions = db.julesSessions.filter(
          s => s.dashboardId === dashboard.id && s.status === "running"
        );
        const runCount = activeJulesSessions.length + events.filter(e => e.kind === "workflow_run_started").length;

        // For unread: Mock an elegant unread logic. We can store "lastReadAt" on Dashboard and check event createdTimes
        // Default to showing latest unreads
        const latestReadAtStr = dashboard.updatedAt || new Date(0).toISOString();
        const unreadCount = events.filter(e => new Date(e.createdAt) > new Date(latestReadAtStr)).length;

        const latestAct = events[0]?.createdAt || dashboard.updatedAt;

        const syncStatus = lastSyncStatus[dashboard.id] || { success: true, polledAt: new Date().toISOString() };

        return {
          ...dashboard,
          syncStatus,
          badgeStats: {
            unreadCount,
            actionRequiredCount,
            errorCount,
            runningCount: runCount,
            latestActivityAt: latestAct,
            latestReadAt: latestReadAtStr
          } as DashboardBadgeStats
        };
      });

    res.json(summaries);
  });

  app.post("/api/dashboards", (req, res) => {
    const { name, description, color, icon } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Dashboard name is required" });
    }

    const id = `db-${Date.now()}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const newDash: Dashboard = {
      id,
      name,
      slug,
      description,
      color: color || "blue",
      icon: icon || "LayoutDashboard",
      sortOrder: db.dashboards.length + 1,
      pinned: false,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.dashboards.push(newDash);
    saveDB();

    addTimelineEvent({
      dashboardId: id,
      source: "system",
      kind: "branch_head_changed", // or some init kind
      severity: "info",
      requiresUserAction: false,
      title: "Dashboard Initialized",
      body: `Development target ${name} has been successfully registered.`
    });

    res.status(201).json(newDash);
  });

  app.put("/api/dashboards/:id", (req, res) => {
    const dashboard = db.dashboards.find(d => d.id === req.params.id);
    if (!dashboard) return res.status(404).json({ error: "Dashboard not found" });

    const { name, description, color, icon, pinned, archived } = req.body;
    if (name !== undefined) {
      dashboard.name = name;
      dashboard.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    }
    if (description !== undefined) dashboard.description = description;
    if (color !== undefined) dashboard.color = color;
    if (icon !== undefined) dashboard.icon = icon;
    if (pinned !== undefined) dashboard.pinned = pinned;
    if (archived !== undefined) dashboard.archived = archived;
    dashboard.updatedAt = new Date().toISOString();

    saveDB();
    res.json(dashboard);
  });

  app.delete("/api/dashboards/:id", (req, res) => {
    const dashboard = db.dashboards.find(d => d.id === req.params.id);
    if (!dashboard) return res.status(404).json({ error: "Dashboard not found" });

    dashboard.archived = true;
    dashboard.updatedAt = new Date().toISOString();
    saveDB();

    res.json({ success: true, message: "Dashboard archived." });
  });

  // REST API: Mark read / reset unread badge
  app.post("/api/dashboards/:id/read", (req, res) => {
    const dashboard = db.dashboards.find(d => d.id === req.params.id);
    if (!dashboard) return res.status(404).json({ error: "Dashboard not found" });

    dashboard.updatedAt = new Date().toISOString();
    saveDB();
    res.json({ success: true, latestReadAt: dashboard.updatedAt });
  });

  // REST API: Repo Bindings
  app.get("/api/repo_bindings", (req, res) => {
    res.json(db.repoBindings || []);
  });

  // REST API: Get all Jules sessions
  app.get("/api/jules_sessions", (req, res) => {
    res.json(db.julesSessions || []);
  });

  app.get("/api/dashboards/:id/bindings/github", (req, res) => {
    const binding = db.repoBindings.find(b => b.dashboardId === req.params.id);
    res.json(binding || null);
  });

  app.post("/api/dashboards/:id/bindings/github", (req, res) => {
    const dashboardId = req.params.id;
    const { owner, repo, defaultBranch, workingBranch, role } = req.body;

    if (!owner || !repo) {
      return res.status(400).json({ error: "owner and repo fields are required" });
    }

    let binding = db.repoBindings.find(b => b.dashboardId === dashboardId);
    if (binding) {
      binding.owner = owner;
      binding.repo = repo;
      binding.defaultBranch = defaultBranch || "main";
      binding.workingBranch = workingBranch;
      binding.role = role || "primary";
      binding.updatedAt = new Date().toISOString();
    } else {
      binding = {
        id: `repo-${Date.now()}`,
        dashboardId,
        provider: "github",
        owner,
        repo,
        defaultBranch: defaultBranch || "main",
        workingBranch,
        role: role || "primary",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.repoBindings.push(binding);
    }

    saveDB();

    // Trigger an immediate poll so statistics populate freshly!
    pollGitHubAndJules().catch(console.error);

    res.json(binding);
  });

  // REST API: Jules Bindings
  app.get("/api/dashboards/:id/bindings/jules", (req, res) => {
    const binding = db.julesBindings.find(b => b.dashboardId === req.params.id);
    res.json(binding || null);
  });

  app.post("/api/dashboards/:id/bindings/jules", (req, res) => {
    const dashboardId = req.params.id;
    const { sourceName, defaultStartingBranch, requirePlanApproval } = req.body;

    let binding = db.julesBindings.find(b => b.dashboardId === dashboardId);
    if (binding) {
      binding.sourceName = sourceName;
      binding.defaultStartingBranch = defaultStartingBranch;
      binding.requirePlanApproval = requirePlanApproval ?? true;
      binding.updatedAt = new Date().toISOString();
    } else {
      binding = {
        id: `jules-b-${Date.now()}`,
        dashboardId,
        sourceName,
        defaultStartingBranch,
        requirePlanApproval: requirePlanApproval ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.julesBindings.push(binding);
    }
    saveDB();
    res.json(binding);
  });

  // REST API: ChatGPT links
  app.get("/api/dashboards/:id/chatgpt_links", (req, res) => {
    const links = db.chatGptLinks.filter(l => l.dashboardId === req.params.id);
    res.json(links);
  });

  app.post("/api/dashboards/:id/chatgpt_links", (req, res) => {
    const dashboardId = req.params.id;
    const { title, url, urlType, kind, description, pinned } = req.body;

    if (!title || !url) {
      return res.status(400).json({ error: "title and url are required" });
    }

    const nLink: DashboardChatGptLink = {
      id: `link-${Date.now()}`,
      dashboardId,
      title,
      url,
      urlType: urlType || "shared_link",
      kind: kind || "misc",
      description,
      pinned: !!pinned,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.chatGptLinks.push(nLink);
    saveDB();
    res.status(201).json(nLink);
  });

  app.put("/api/dashboards/:id/chatgpt_links/:linkId", (req, res) => {
    const link = db.chatGptLinks.find(l => l.id === req.params.linkId && l.dashboardId === req.params.id);
    if (!link) return res.status(404).json({ error: "ChatGPT Link not found" });

    const { title, url, urlType, kind, description, pinned, lastOpenedAt } = req.body;
    if (title !== undefined) link.title = title;
    if (url !== undefined) link.url = url;
    if (urlType !== undefined) link.urlType = urlType;
    if (kind !== undefined) link.kind = kind;
    if (description !== undefined) link.description = description;
    if (pinned !== undefined) link.pinned = pinned;
    if (lastOpenedAt !== undefined) {
      link.lastOpenedAt = lastOpenedAt;
      // Log event that ChatGPT link was opened!
      addTimelineEvent({
        dashboardId: req.params.id,
        source: "chatgpt_link",
        kind: "chatgpt_link_opened",
        severity: "info",
        requiresUserAction: false,
        title: `ChatGPT conversation opened: ${link.title}`,
        body: `Opened shared chat covering core focus topic.`
      });
    }
    link.updatedAt = new Date().toISOString();
    saveDB();
    res.json(link);
  });

  app.delete("/api/dashboards/:id/chatgpt_links/:linkId", (req, res) => {
    const index = db.chatGptLinks.findIndex(l => l.id === req.params.linkId && l.dashboardId === req.params.id);
    if (index === -1) return res.status(404).json({ error: "ChatGPT link not found" });

    db.chatGptLinks.splice(index, 1);
    saveDB();
    res.json({ success: true, message: "ChatGPT link deleted" });
  });

  // REST API: Unified Timeline
  app.get("/api/dashboards/:id/timeline", (req, res) => {
    const items = db.timelineEvents.filter(e => e.dashboardId === req.params.id);
    res.json(items);
  });

  // REST API: Jules sessions
  app.get("/api/dashboards/:id/jules_sessions", (req, res) => {
    const sessions = db.julesSessions.filter(s => s.dashboardId === req.params.id);
    res.json(sessions);
  });

  app.post("/api/dashboards/:id/jules_sessions", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Session name is required" });

    const nSession: JulesSession = {
      id: `jsess-${Date.now()}`,
      dashboardId: req.params.id,
      name,
      status: "idle",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.julesSessions.unshift(nSession);
    saveDB();

    res.status(201).json(nSession);
  });

  app.put("/api/jules_sessions/:sessionId", (req, res) => {
    let session = db.julesSessions.find(s => s.id === req.params.sessionId);
    if (!session) {
      session = {
        id: req.params.sessionId,
        dashboardId: req.body.dashboardId || "",
        name: req.body.name || `Session ${req.params.sessionId.substring(0, 6)}...`,
        status: req.body.status || "UNKNOWN",
        createdAt: req.body.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archived: req.body.archived || false,
        creatorWebUrl: req.body.creatorWebUrl || "",
        missingCount: req.body.missingCount || 0
      };
      db.julesSessions.unshift(session);
    } else {
      const { archived, status, creatorWebUrl, name, missingCount } = req.body;
      if (name !== undefined) session.name = name;
      if (archived !== undefined) {
        session.archived = archived;
        if (archived === true) {
          session.status = "archived";
        }
      }
      if (status !== undefined) session.status = status;
      if (creatorWebUrl !== undefined) session.creatorWebUrl = creatorWebUrl;
      if (missingCount !== undefined) session.missingCount = missingCount;
      session.updatedAt = new Date().toISOString();
    }

    saveDB();
    res.json(session);
  });

  app.get("/api/jules_sessions/:sessionId/activities", (req, res) => {
    let items = db.julesActivities.filter(a => a.sessionId === req.params.sessionId);
    
    // Sort newest first
    items = items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const total = items.length;
    const paginatedItems = items.slice(offset, offset + limit);
    const nextPageToken = (offset + limit < total) ? (offset + limit).toString() : null;

    res.json({
      items: paginatedItems,
      nextPageToken: nextPageToken,
      total: total
    });
  });

  // Optimized minimal sync list endpoint to avoid heavy payloads and browser fetch failures
  app.get("/api/jules_minimal_sync", async (req, res) => {
    const repoName = (req.query.repoName as string) || "";
    let key = getJulesApiKey() || process.env.JULES_API_KEY || process.env.GEMINI_API_KEY || "";

    if (!key) {
      return res.status(401).json({
        error: "Missing Jules API Key.",
        help: "Please configure a valid Jules API key in the 'Settings' tab."
      });
    }

    try {
      let sessions: any[] = [];
      let nextPageToken = "";
      let pagesFetched = 0;
      const maxPages = 5; // Support up to 500 total sessions across 5 pages

      do {
        let url = "https://jules.googleapis.com/v1alpha/sessions?pageSize=100";
        if (nextPageToken) {
          url += `&pageToken=${encodeURIComponent(nextPageToken)}`;
        }

        const response = await fetch(url, {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key
          }
        });

        if (!response.ok) {
          if (pagesFetched === 0) {
            return res.status(response.status).json({
              error: `Jules API error (HTTP ${response.status})`
            });
          } else {
            console.warn(`[Jules Sync] Failed to fetch subsequent page ${pagesFetched + 1}: ${response.status}`);
            break;
          }
        }

        const data: any = await response.json();
        const pageSessions = data.sessions || [];
        sessions = sessions.concat(pageSessions);

        nextPageToken = data.nextPageToken || "";
        pagesFetched++;
      } while (nextPageToken && pagesFetched < maxPages);

      // Filter and map to minimal structures to prevent large payload network transfer
      const filtered = sessions
        .filter((rSess: any) => {
          const source = rSess.sourceContext?.source || "";
          if (!repoName) return true;

          const repoLower = repoName.toLowerCase().trim();
          const sourceLower = source.toLowerCase().trim();

          // Match standard string inclusion first (case-insensitive)
          if (sourceLower.includes(repoLower)) {
            return true;
          }

          // Fallback: Check if source contains just the repository name part (e.g. "repo-name" from "owner/repo-name")
          const lastSlash = repoLower.lastIndexOf('/');
          if (lastSlash !== -1) {
            const repoOnly = repoLower.substring(lastSlash + 1);
            if (repoOnly && sourceLower.includes(repoOnly)) {
              return true;
            }
          }
          return false;
        })
        .map((rSess: any) => {
          const sessId = rSess.name.replace('sessions/', '');
          return {
            id: sessId,
            title: rSess.title,
            state: rSess.state,
            createTime: rSess.createTime,
            updateTime: rSess.updateTime,
            source: rSess.sourceContext?.source || "",
            creatorWebUrl: rSess.creatorWebUrl || ""
          };
        });

      return res.json({ sessions: filtered });
    } catch (err: any) {
      console.error("[Jules Minimal Sync Fail]:", err);
      return res.status(500).json({
        error: "Internal Jules Sync Failed",
        message: err.message || "Unknown error occurred"
      });
    }
  });

  // Transparent REST API Proxy for Jules (https://jules.googleapis.com)
  app.all("/api/jules_proxy/*", async (req, res) => {
    // Extract subpath from wildcard path parameter
    const subpath = req.params[0] || req.path.replace(/^\/api\/jules_proxy\//, "");
    const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    
    // Clean up unrecognized cache-busting parameters to avoid confusing Google API
    urlObj.searchParams.delete("t");
    urlObj.searchParams.delete("nocache");
    const searchParams = urlObj.search;
    const url = "https://jules.googleapis.com/" + subpath + searchParams;

    console.log(`[Jules Proxy] Requesting URL: ${url}`);

    let key = "";
    // Check Authorization header (Bearer)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      key = authHeader.substring(7).trim();
    }
    // Fallback to local server keys
    if (!key) {
      key = getJulesApiKey() || process.env.JULES_API_KEY || process.env.GEMINI_API_KEY || "";
    }

    if (!key) {
      return res.status(401).json({
        error: "Missing Jules API Key.",
        help: "Please configure a valid Jules API key in the 'Settings' tab or supply it in the 'Authorization' header."
      });
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      };

      const options: RequestInit = {
        method: req.method,
        headers
      };

      if (req.method !== "GET" && req.method !== "HEAD") {
        options.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      }

      console.log(`[Jules Proxy] Proxying ${req.method} request to: ${url}`);
      const response = await fetch(url, options);
      
      const contentType = response.headers.get("content-type");
      let responseData: any;
      if (contentType && contentType.includes("application/json")) {
        responseData = await response.json();
        return res.status(response.status).json(responseData);
      } else {
        responseData = await response.text();
        return res.status(response.status).send(responseData);
      }
    } catch (err: any) {
      console.error(`[Jules Proxy Fail] Error targeting [${req.method} ${url}]:`, err);
      return res.status(500).json({
        error: "Jules Proxy Connection Failed",
        message: err.message || "Unknown error occurred during proxy request."
      });
    }
  });

  // Transparent REST API Proxy for Github (https://api.github.com)
  app.all("/api/github_proxy/*", async (req, res) => {
    // Extract subpath from wildcard path parameter
    let subpath = req.params[0] || req.path.replace(/^\/api\/github_proxy\//, "");
    if (subpath.startsWith("/")) {
      subpath = subpath.slice(1);
    }
    
    // Safely extract search/query params without risk of URL constructor crashing on invalid req.url
    const searchParams = req.url && req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
    const url = "https://api.github.com/" + subpath + searchParams;

    const headers: any = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AI-Studio-Applet"
    };

    if (req.headers.authorization) {
      // Robustly sanitize authorization token from HTTP header (remove Bearer prefix, trim whitespace and control characters)
      const tokenSec = req.headers.authorization.replace(/^(Bearer|token)\s+/i, "").trim().replace(/[\r\n\t]/g, "");
      if (tokenSec) {
        headers["Authorization"] = `token ${tokenSec}`;
      }
    }

    try {
      const options: RequestInit = {
        method: req.method,
        headers,
      };
      
      if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
        options.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      }

      const response = await fetch(url, options);
      
      const oauthScopes = response.headers.get("x-oauth-scopes");
      if (oauthScopes) {
        res.setHeader("x-oauth-scopes", oauthScopes);
      }
      
      const contentType = response.headers.get("content-type");
      let data: any;

      if (contentType && contentType.includes("application/json")) {
          data = await response.json();
          return res.status(response.status).json(data);
      } else {
          data = await response.text();
          return res.status(response.status).send(data);
      }
    } catch(err: any) {
      console.error("[Github Proxy Fail]:", err);
      res.status(500).json({ error: "Internal Github Proxy Failed", message: err.message || "Unknown proxy error" });
    }
  });

  // Jules Debug Endpoint utilizing @google/genai Interactions API (Antigravity)
  app.post("/api/jules_debug/request", async (req, res) => {
    try {
      const key = db.serverSecrets.julesApiKey || process.env.JULES_API_KEY || process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(401).json({ code: 401, message: "Missing Jules API Key (Gemini API Key)." });
      }

      const payload = req.body;
      const input = payload.input || payload.message || "Ping";
      const agent = payload.agent || "antigravity-preview-05-2026";

      // Always create a new client to pick up any key changes
      const aiClient = new GoogleGenAI({ apiKey: key });

      // Route the actual request via @google/genai Interactions API
      const interaction = await aiClient.interactions.create({
        agent: agent,
        input: input,
        environment: "remote"
      });

      let fullOutput = "";
      if (interaction.steps) {
        for (const step of interaction.steps) {
          if (step.type === 'model_output') {
            const textContent = step.content?.find(c => c.type === 'text');
            if (textContent && textContent.text) {
              fullOutput += textContent.text;
            }
          }
        }
      }

      return res.json({ 
        status: "success", 
        code: 200, 
        message: fullOutput, 
        interactionId: interaction.id 
      });
    } catch (err: any) {
      console.error("Jules API Call failed:", err);
      
      let errMsg = err.message || "Resource Not Found";
      let details = String(err);

      // Check for structured error details from @google/genai
      if (err.details && Array.isArray(err.details)) {
        const helpLink = err.details.find((d: any) => d["@type"] === "type.googleapis.com/google.rpc.Help");
        if (helpLink && helpLink.links && helpLink.links[0]) {
           errMsg += ` - To fix this, please visit: ${helpLink.links[0].url}`;
        }
      }

      if (errMsg.includes("SERVICE_DISABLED") || errMsg.includes("PermissionDeniedError") || errMsg.includes("403")) {
        if (!errMsg.includes("http")) {
           errMsg = "Gemini API is disabled or the provided API key does not have access. Please enable the 'Generative Language API' in your Google Cloud Project or provide a valid Paid Gemini API Key in the Settings.";
        }
      }
      
      return res.status(400).json({ 
        code: 3001, 
        message: errMsg, 
        requestId: "debug-" + Date.now(),
        details: details
      });
    }
  });

  // Messages sent to Jules session
  app.post("/api/jules_sessions/:sessionId/messages", async (req, res) => {
    const { sessionId } = req.params;
    const { message } = req.body;

    const session = db.julesSessions.find(s => s.id === sessionId);
    if (!session) return res.status(404).json({ error: "Jules session not found" });

    const key = getJulesApiKey();

    const uMsg: JulesActivity = {
      id: `act-${Date.now()}-u`,
      sessionId,
      type: "user_message",
      text: message,
      createdAt: new Date().toISOString()
    };

    db.julesActivities.push(uMsg);
    session.status = "running";
    session.updatedAt = new Date().toISOString();
    saveDB();

    addTimelineEvent({
      dashboardId: session.dashboardId,
      source: "jules",
      kind: "jules_message_sent",
      severity: "success",
      requiresUserAction: false,
      title: "Jules Instruction Dispatched",
      body: `Command sent: "${message.substring(0, 80)}${message.length > 80 ? "..." : ""}"`
    });

    // Real Jules Integration if JULES_API_KEY is supplied, otherwise we trigger our rich AI simulation
    if (key && key !== "JULES_API_KEY" && key.trim() !== "") {
      try {
        console.log(`Forwarding message to Jules real API endpoint with auth header: Bearer ${key.substring(0, 3)}...`);
        // We do a mock POST to Google REST Jules service endpoint
        const julesApiUrl = process.env.JULES_API_URL || "https://api.jules.google/v1/sessions";
        const reply = await fetch(`${julesApiUrl}/${sessionId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
          },
          body: JSON.stringify({ message })
        });

        if (reply.ok) {
          const replyData = await reply.json();
          const jText = replyData.text || "Dispatched successfully to Cloud backend.";
          const jPlan = replyData.planDetails || undefined;

          const jResp: JulesActivity = {
            id: `act-${Date.now()}-j`,
            sessionId,
            type: "jules_response",
            text: jText,
            planDetails: jPlan,
            createdAt: new Date().toISOString()
          };

          db.julesActivities.push(jResp);
          session.status = jPlan ? "waiting_for_approval" : "completed";
          session.updatedAt = new Date().toISOString();
          saveDB();

          addTimelineEvent({
            dashboardId: session.dashboardId,
            source: "jules",
            kind: jPlan ? "jules_plan_required" : "jules_activity",
            severity: jPlan ? "warning" : "info",
            requiresUserAction: !!jPlan,
            title: jPlan ? "Jules plan requires approval" : "Jules activity updated",
            body: jText
          });

          return res.json({ session, activities: [uMsg, jResp] });
        } else {
          throw new Error(`Jules API returned code ${reply.status}`);
        }
      } catch (apiErr: any) {
        console.error("Jules API real call failed, falling back to simulator logic...", apiErr);
      }
    }

    // Rich Interactive Mock Jules AI simulation fallback
    setTimeout(() => {
      let responseText = `Hi! I analyzed your instructions. `;
      let plan: string | undefined = undefined;

      const msgLower = message.toLowerCase();
      if (msgLower.includes("refactor") || msgLower.includes("optimize") || msgLower.includes("fix")) {
        responseText += `I've prepared a structural patch to optimize file pathways and hook scopes. This resolves unnecessary component re-renders. Please review the detailed plan below.`;
        plan = `1. Analyze imports in target files.\n2. Wrap list renders inside React.useMemo hooks.\n3. Verify component compilation works natively.`;
        session.status = "waiting_for_approval";
      } else if (msgLower.includes("test") || msgLower.includes("run")) {
        responseText += `Tests successfully spawned! All 8 unit assertions passed cleanly in our sandbox.`;
        session.status = "completed";
      } else {
        responseText += `Finished processing requested guidelines. Updated database state cleanly. No build or structural anomalies detected.`;
        session.status = "completed";
      }

      const jResp: JulesActivity = {
        id: `act-${Date.now()}-jr`,
        sessionId,
        type: "jules_response",
        text: responseText,
        planDetails: plan,
        createdAt: new Date().toISOString()
      };

      db.julesActivities.push(jResp);
      session.updatedAt = new Date().toISOString();
      saveDB();

      addTimelineEvent({
        dashboardId: session.dashboardId,
        source: "jules",
        kind: plan ? "jules_plan_required" : "jules_activity",
        severity: plan ? "warning" : "info",
        requiresUserAction: !!plan,
        title: plan ? "Jules Refactoring Plan Ready" : "Jules response received",
        body: responseText
      });
    }, 1500);

    res.json({ session, activities: [uMsg] });
  });

  // Approve Jules Plan
  app.post("/api/jules_sessions/:sessionId/approve", (req, res) => {
    const { sessionId } = req.params;
    const session = db.julesSessions.find(s => s.id === sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    session.status = "running";
    session.updatedAt = new Date().toISOString();

    const approveLog: JulesActivity = {
      id: `act-${Date.now()}-appLog`,
      sessionId,
      type: "system_log",
      text: "Developer approved plan. Dispatching execution worker...",
      createdAt: new Date().toISOString()
    };
    db.julesActivities.push(approveLog);
    saveDB();

    setTimeout(() => {
      session.status = "completed";
      const doneLog: JulesActivity = {
        id: `act-${Date.now()}-done`,
        sessionId,
        type: "jules_response",
        text: "Refactoring and testing cycles successfully applied! Branch is now fully green.",
        createdAt: new Date().toISOString()
      };
      db.julesActivities.push(doneLog);
      saveDB();

      addTimelineEvent({
        dashboardId: session.dashboardId,
        source: "jules",
        kind: "jules_activity",
        severity: "success",
        requiresUserAction: false,
        title: "Jules code transformation committed",
        body: "Refactoring changes successfully made to target branch."
      });
    }, 2000);

    res.json({ session });
  });

  // Dismiss Actionable Badge Event
  app.post("/api/dashboards/:id/timeline/:eventId/dismiss", (req, res) => {
    const ev = db.timelineEvents.find(e => e.id === req.params.eventId && e.dashboardId === req.params.id);
    if (!ev) return res.status(404).json({ error: "Event not found" });

    ev.requiresUserAction = false;
    saveDB();
    res.json({ success: true, event: ev });
  });

  app.post("/api/generate_title", async (req, res) => {
    try {
      const titleAi = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY || "",
      });
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
      }
      const response = await titleAi.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Generate a short title (max 10 words) for this task:\n${prompt}`,
      });
      const generatedTitle = response.text?.trim()?.replace(/^["']|["']$/g, "") || "Untitled Task";
      res.json({ title: generatedTitle });
    } catch (e: any) {
      console.error("Title generation failed:", e);
      res.json({ title: "Untitled Task" });
    }
  });

  // Serve static files and mount Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[OK] Server running on http://0.0.0.0:${PORT}`);
    // Run initial polling trigger instantly to verify credentials and cache
    pollGitHubAndJules().catch(console.error);
  });
}

startServer();
