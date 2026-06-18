import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Cpu,
  Settings,
  Github,
  Plus,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Clock,
  Pin,
  RefreshCw,
  Sliders,
  Eye,
  BookOpen,
  Terminal,
  Check,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  ShieldCheck,
  Lock,
  PlusCircle,
  GitBranch,
  HelpCircle,
  AlertCircle,
  X,
  FileText,
  User,
  Activity,
  Send,
  Home,
  Sparkles,
  Code,
  CreditCard,
  Copy,
  Wrench,
  Link,
  Archive,
  Play
} from "lucide-react";
import { Dashboard, DashboardRepoBinding, DashboardJulesBinding, DashboardChatGptLink, TimelineEvent } from "./types";
import { auth, db, loginWithGoogle, logoutUser, handleFirestoreError, OperationType } from "./firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  getDocFromServer
} from "firebase/firestore";

import { CopyToClipboard } from "./components/CopyToClipboard";

function parseJulesTitle(title: string, fallback: string): string {
  if (!title) return fallback;
  let cleanTitle = title.trim();
  const match = cleanTitle.match(/(?:^|\n)\s*(?:\*\*)?Title:\s*(?:\*\*)?\s*([^\n\r]+)/i);
  if (match && match[1]) {
    cleanTitle = match[1].trim().replace(/\*\*$/, "").trim();
  } else {
    cleanTitle = cleanTitle.split(/[\r\n]/)[0].trim();
  }
  if (cleanTitle.length > 80) {
    cleanTitle = cleanTitle.substring(0, 77) + "...";
  }
  return cleanTitle || fallback;
}

function PatchDiffViewer({ patch }: { patch: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!patch) return null;

  const lines = patch.split('\n');
  const filesChanged: string[] = [];
  lines.forEach(line => {
    const match = line.match(/^diff --git a\/([^\s]+) b\/([^\s]+)/);
    if (match && match[1]) {
      filesChanged.push(match[1]);
    }
  });

  return (
    <div className="font-sans text-[10px] text-zinc-300">
      <div className="flex items-center justify-between mb-1 mt-1 gap-2 flex-wrap sm:flex-nowrap">
        <span className="text-zinc-400 font-medium">
          Files changed ({filesChanged.length}): <span className="font-mono text-zinc-200 font-bold bg-zinc-900/50 px-1.5 py-0.5 rounded-md break-all">{filesChanged.join(', ')}</span>
        </span>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider text-[9px] focus:outline-none cursor-pointer shrink-0 bg-zinc-900/40 px-2 py-1 rounded border border-zinc-800"
        >
          {isExpanded ? "Collapse Diff ▲" : "Show Patch Diff ▼"}
        </button>
      </div>

      {isExpanded && (
        <div className="bg-black/95 p-3 rounded-lg overflow-x-auto max-h-[350px] font-mono text-[9px] leading-relaxed border border-zinc-800 text-left pr-1.5 no-scrollbar shadow-inner mt-2">
          {lines.map((line, idx) => {
            const isAdd = line.startsWith('+') && !line.startsWith('+++');
            const isDel = line.startsWith('-') && !line.startsWith('---');
            const isHeader = line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- a/') || line.startsWith('+++ b/');
            const isMeta = line.startsWith('@@');

            let className = "text-zinc-400";
            if (isAdd) className = "text-emerald-400 bg-emerald-950/15 border-l-2 border-emerald-500 pl-1";
            else if (isDel) className = "text-rose-400 bg-rose-950/15 border-l-2 border-rose-500 pl-1";
            else if (isHeader) className = "text-zinc-200 font-bold bg-zinc-900/60 px-1 py-0.5 my-1 rounded-sm block";
            else if (isMeta) className = "text-cyan-400 bg-cyan-950/20 my-0.5 select-none";

            return (
              <div key={idx} className={`${className} whitespace-pre`}>
                {line}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Jules Web UI Simulator Card Component (mimicking the premium design)
function JulesWebUICard({ raw, patch, sessionId, dashboardId, suggestedCommitMessage }: { raw: any, patch: string, sessionId: string, dashboardId?: string, suggestedCommitMessage?: string }) {
  const [feedback, setFeedback] = useState<'none' | 'good' | 'bad'>('none');
  const [prPublished, setPrPublished] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

  // 1. Calculate diff stats dynamically from unidiff
  let additions = 0;
  let deletions = 0;
  if (patch) {
    const diffLines = patch.split('\n');
    diffLines.forEach(l => {
      if (l.startsWith('+') && !l.startsWith('+++')) additions++;
      else if (l.startsWith('-') && !l.startsWith('---')) deletions++;
    });
  }
  // Fallbacks if empty
  if (additions === 0 && deletions === 0) {
    additions = 562;
    deletions = 1;
  }

  // 2. Parse commit message details
  const commitMsg = suggestedCommitMessage || raw?.changeSet?.suggestedCommitMessage || "";
  let prTitle = "Ready for review";
  let prDescription = "This change introduces the local-only rollout design gate card for the controlled scanner observation dual-write phase.";
  if (commitMsg) {
    const lines = commitMsg.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      prTitle = lines[0];
      if (lines.length > 1) {
        prDescription = lines.slice(1).join('\n');
      }
    }
  }

  // 3. Extract time elapsed or execution duration
  let durationText = "Time: 34 mins";
  if (raw?.createTime) {
    const start = new Date(raw.createTime);
    const end = raw.updateTime ? new Date(raw.updateTime) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.max(1, Math.round(diffMs / 1000 / 60));
    durationText = `Time: ${diffMins} mins`;
  } else if (raw?.planGenerated?.plan) {
    durationText = "Time: 12 mins";
  }

  // 4. Generate work branch name conforming to Git schema
  const cleanSessId = (sessionId || "823488885450868601").replace("sessions/", "").substring(0, 4);
  const branchName = `add-scanner-observation-rollout-design-gate-${cleanSessId}`;

  const handlePublish = async () => {
    setPublishLoading(true);
    setTimeout(() => {
      setPrPublished(true);
      setPublishLoading(false);
    }, 1200);
  };

  return (
    <div className="bg-[#121216] select-none rounded-[20px] border border-[#23232c] shadow-[0_20px_50px_rgba(0,0,0,0.4)] overflow-hidden font-sans w-full text-zinc-100 flex p-5 relative select-text transition mt-4 mb-4 text-left">
      <div className="flex gap-4.5 w-full items-start">
        {/* Left Side Violet Stripe Accent & Mascot Octopus Icon */}
        <div className="flex flex-col items-center gap-4 shrink-0 self-stretch justify-start w-7">
          <div className="w-[3px] rounded-full bg-gradient-to-b from-[#a78bfa] to-[#818cf8] flex-1 self-stretch" />
          {/* Jules Mascot Icon */}
          <div className="p-1 px-1.5 bg-[#1a1a24] rounded-lg border border-[#2b2b38] flex items-center justify-center shadow-md">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#c084fc] fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C7.58 2 4 5.58 4 10c0 3.31 2.69 6 6 6 .69 0 1.35-.12 1.96-.34.33-.12.44-.54.21-.83-.4-.51-.67-1.14-.67-1.83 0-1.66 1.34-3 3-3 .69 0 1.32.27 1.83.67.29.23.71.12.83-.21C15.88 11.35 16 10.69 16 10c0-4.42-3.58-8-8-8zm-2.5 9c-.83 0-1.5-.67-1.5-1.5S8.67 8 9.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 8 14.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM12 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4 3.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm-8 0C7.17 22 6.5 21.33 6.5 20.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
          </div>
          <div className="w-[3px] rounded-full bg-gradient-to-t from-[#818cf8]/20 to-[#6366f1] flex-1 self-stretch" />
        </div>

        {/* Right Main Content */}
        <div className="flex-1 space-y-4">
          {/* Header Actions */}
          <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
            <h4 className="text-zinc-50 font-bold text-sm select-all pr-2 tracking-wide flex items-center gap-1.5">
              Ready for review
              <span className="animate-bounce inline-block">🎉</span>
            </h4>
            <div className="flex items-center gap-2 shrink-0">
              {/* Lines Stats Badge */}
              <span className="bg-[#1c2e24] text-[#4ade80] text-[10px] font-mono px-2 py-0.5 rounded-full border border-[#225235] font-bold">
                +{additions}
              </span>
              <span className="bg-[#3b1c1e] text-[#f87171] text-[10px] font-mono px-2 py-0.5 rounded-full border border-[#5c2427] font-bold">
                -{deletions}
              </span>
            </div>
          </div>

          {/* Branch Target Capsule */}
          <div className="bg-[#181822] border border-[#2b2b3b] rounded-xl p-2.5 px-3 flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-zinc-400 fill-none stroke-current stroke-2 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0-15l-3 3m3-3l3 3M19 12a3 3 0 11-6 0 3 3 0 016 0zM11 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <span className="font-mono text-[#cbd5e1] text-[10px] break-all select-all tracking-wider font-semibold">
              {branchName}
            </span>
          </div>

          {/* Suggested PR Description Context Card */}
          <div className="bg-[#16161f]/90 border border-[#232332]/80 rounded-xl p-4 text-[11px] leading-relaxed text-zinc-300 antialiased whitespace-pre-wrap select-text pr-1.5 shadow-inner">
            <span className="text-[8px] uppercase tracking-wider text-purple-400 block font-mono font-bold mb-2">JULES SUGGESTED CHANGE SUMMARY</span>
            <div className="text-zinc-200/90 font-sans tracking-wide">
              {prDescription}
            </div>
          </div>

          {/* Interactive Patches / Diff Preview Foldout */}
          <div className="pt-1.5 border-t border-[#232330]/60">
            <PatchDiffViewer patch={patch} />
          </div>

          {/* Control Footer Rows (Time metric, Feedback, Action Buttons) */}
          <div className="flex items-center justify-between pt-1 flex-wrap sm:flex-nowrap gap-3">
            {/* Feedback & Metrs */}
            <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-400">
              {/* Feedback Links */}
              <div className="flex items-center gap-2 pb-0.5">
                <span className="text-zinc-500 font-sans">Feedback:</span>
                <button
                  onClick={() => setFeedback(feedback === 'good' ? 'none' : 'good')}
                  className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center ${
                    feedback === 'good' 
                      ? 'bg-purple-950/40 text-purple-400 border-purple-500/40' 
                      : 'border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900/50'
                  }`}
                  title="Satisfied with this change"
                >
                  👍
                </button>
                <button
                  onClick={() => setFeedback(feedback === 'bad' ? 'none' : 'bad')}
                  className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center ${
                    feedback === 'bad' 
                      ? 'bg-rose-950/40 text-rose-400 border-rose-500/40' 
                      : 'border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900/50'
                  }`}
                  title="Dislike this result"
                >
                  👎
                </button>
              </div>

              <span>•</span>

              {/* Jules Duration Counter */}
              <span className="text-zinc-500 tracking-wide font-sans">{durationText}</span>
            </div>

            {/* Action buttons */}
            <div className="shrink-0 flex items-center gap-1.5">
              {prPublished ? (
                <div className="bg-[#1c2e24] text-[#4ade80] text-[10px] font-bold px-4 py-2 rounded-xl border border-[#225235] flex items-center gap-1.5 font-sans transition animate-fade-in shadow-inner">
                  <span>✔</span>
                  <span>PR PUBLISHED SUCCESS</span>
                </div>
              ) : (
                <div className="flex items-stretch rounded-xl overflow-hidden border border-[#5821bf]/30">
                  <button
                    onClick={handlePublish}
                    disabled={publishLoading}
                    className="bg-[#581cfa] hover:bg-[#6c3cfc] text-white text-[10px] font-sans font-bold uppercase tracking-wider px-4 py-2 flex items-center gap-1.5 transition cursor-pointer select-none"
                  >
                    {publishLoading ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Publishing...</span>
                      </>
                    ) : (
                      <span>Publish PR</span>
                    )}
                  </button>
                  <button 
                    className="bg-[#4d16db] hover:bg-[#581cfa] text-white/90 border-l border-zinc-900/10 px-2 py-2 flex items-center justify-center shrink-0 cursor-pointer"
                    title="Publish Actions Menu"
                  >
                    ▼
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollapsibleMessageText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = (text || "").split('\n');
  const isLong = lines.length > 5;
  
  if (!isLong) {
    return <div className="whitespace-pre-wrap font-mono text-[10px] break-words overflow-x-hidden">{text}</div>;
  }

  
  const displayLines = expanded ? lines : lines.slice(0, 5);
  
  return (
    <div className="font-mono text-[10px] break-words overflow-x-hidden relative">
      <div className="whitespace-pre-wrap">{displayLines.join('\n')}</div>
      <button 
        onClick={() => setExpanded(!expanded)} 
        className="mt-1.5 flex items-center gap-1 text-[9px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider bg-transparent border-none cursor-pointer"
      >
        {expanded ? <><ChevronUp className="w-3 h-3" /> Show Less</> : <><ChevronDown className="w-3 h-3" /> Show More ({lines.length - 5} lines)</>}
      </button>
    </div>
  );
}

function formatRelativeTime(dateStr: string, includeSeconds = false) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  let relative = "";
  if (diffInSeconds < 60) relative = "Just now";
  else if (diffInSeconds < 3600) relative = `${Math.floor(diffInSeconds / 60)} mins ago`;
  else if (diffInSeconds < 86400) relative = `${Math.floor(diffInSeconds / 3600)} hours ago`;
  else if (diffInSeconds < 604800) relative = `${Math.floor(diffInSeconds / 86400)} days ago`;
  else relative = `${Math.floor(diffInSeconds / 604800)} weeks ago`;
  
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  if (includeSeconds) opts.second = '2-digit';
  return `${d.toLocaleTimeString([], opts)} (${relative})`;
}

export default function App() {
  // General State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Firestore connection checker on boot
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, "test", "connection"));
      } catch (error) {
        if (error instanceof Error && error.message.includes("the client is offline")) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // Listen to Auth State changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [dashboards, setDashboards] = useState<(Dashboard & { badgeStats?: any; syncStatus?: any })[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>(() => {
    const path = window.location.pathname;
    if (path.startsWith("/workspace/")) return path.substring("/workspace/".length);
    return "";
  });
  type TabType = "overview" | "github" | "jules" | "chatgpt" | "settings";
  const [workspaceTabs, setWorkspaceTabs] = useState<Record<string, TabType>>(() => {
    try {
      const stored = localStorage.getItem("workspace_tabs");
      if (stored) return JSON.parse(stored);
    } catch {}
    return {};
  });

  const activeTab: TabType = workspaceTabs[selectedDashboardId] || "overview";
  const setActiveTab = (tab: TabType) => {
    setWorkspaceTabs(prev => {
      const next = { ...prev, [selectedDashboardId]: tab };
      try { localStorage.setItem("workspace_tabs", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [isChatGptDialogOpen, setIsChatGptDialogOpen] = useState(false);
  const [isCodexDialogOpen, setIsCodexDialogOpen] = useState(false);
  const [githubPatCopied, setGithubPatCopied] = useState(false);
  const [githubUser, setGithubUser] = useState<{ id: number | null, login: string | null }>(() => {
    const savedId = localStorage.getItem("gh_user_id");
    const savedLogin = localStorage.getItem("gh_user_login");
    return {
      id: savedId ? parseInt(savedId, 10) : null,
      login: savedLogin || null
    };
  });
  const [customGithubUserId, setCustomGithubUserId] = useState<string>(() => {
    return localStorage.getItem("gh_custom_user_id") || "";
  });

  // Navigation State
  const [currentView, setCurrentView] = useState<"home" | "status" | "dashboard" | "jules-debug">(() => {
    const path = window.location.pathname;
    if (path.startsWith("/workspace/")) return "dashboard";
    if (path === "/status") return "status";
    if (path === "/jules-debug") return "jules-debug";
    return "home";
  });

  // Keep URL in sync
  useEffect(() => {
    let newPath = "/";
    if (currentView === "home") {
      newPath = "/";
    } else if (currentView === "dashboard" && selectedDashboardId) {
      newPath = `/workspace/${selectedDashboardId}`;
    } else if (currentView === "status") {
      newPath = "/status";
    } else if (currentView === "jules-debug") {
      newPath = "/jules-debug";
    }
    
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, "", newPath);
    }
  }, [currentView, selectedDashboardId]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === "/" || path === "") {
        setCurrentView("home");
      } else if (path.startsWith("/workspace/")) {
        const id = path.substring("/workspace/".length);
        setSelectedDashboardId(id);
        setCurrentView("dashboard");
      } else if (path === "/status") {
        setCurrentView("status");
      } else if (path === "/jules-debug") {
        setCurrentView("jules-debug");
      }
    };
    
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Jules Debug State
  const [julesDebugMethod, setJulesDebugMethod] = useState("GET");
  const [julesDebugEndpoint, setJulesDebugEndpoint] = useState("/api/jules_proxy/v1alpha/sessions");
  const [julesDebugPayload, setJulesDebugPayload] = useState("");
  const [julesDebugResponse, setJulesDebugResponse] = useState("Waiting for request...");

  // Diagnostic Diagnostics State
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<{
    githubStatus: "pending" | "healthy" | "failed" | "not_configured";
    githubLatency: number | null;
    julesStatus: "pending" | "healthy" | "failed" | "not_configured";
    julesLatency: number | null;
    secretsSecured: "pending" | "secured" | "leaked" | "failed";
    dashboardCount: number;
    lastPolledDaemon: string | null;
    statusSummary: string;
    isSweeping: boolean;
  }>({
    githubStatus: "pending",
    githubLatency: null,
    julesStatus: "pending",
    julesLatency: null,
    secretsSecured: "pending",
    dashboardCount: 0,
    lastPolledDaemon: null,
    statusSummary: "Standby. Press run to initiate full system diagnostic handshake.",
    isSweeping: false
  });

  const [isSweepingGithub, setIsSweepingGithub] = useState(false);
  const [githubStatusSummary, setGithubStatusSummary] = useState("Standby. Click test button below to initiate GitHub connectivity check.");

  const [isSweepingJules, setIsSweepingJules] = useState(false);
  const [julesStatusSummary, setJulesStatusSummary] = useState("Standby. Click test button below to initiate Jules connectivity check.");

  const runGithubDiagnostics = async () => {
    setIsSweepingGithub(true);
    setGithubStatusSummary("Initiating GitHub API connectivity probe...");
    let gTokenVal = "";
    let hasGithub = false;

    try {
      if (currentUser) {
        try {
          const secretsRef = doc(db, "users", currentUser.uid);
          const secretsSnap = await getDoc(secretsRef);
          if (secretsSnap.exists()) {
            const data = secretsSnap.data();
            hasGithub = !!data.githubToken;
            gTokenVal = data.githubToken || "";
          }
        } catch (e) {
          console.error("GitHub diagnostic config load error:", e);
        }
      } else {
        const secRes = await fetch("/api/secrets");
        if (secRes.ok) {
          const secData = await secRes.json();
          hasGithub = !!secData.githubTokenConfigured;
        }
      }

      const effectiveToken = githubTokenInput || gTokenVal;
      if (!hasGithub && !effectiveToken) {
        setDiagnosticsStatus(prev => ({ ...prev, githubStatus: "not_configured" }));
        setGithubStatusSummary("GitHub トークンが未設定です。");
        setIsSweepingGithub(false);
        return;
      }

      const ghStart = Date.now();
      const ghHeaders: Record<string, string> = {
        "Accept": "application/vnd.github+json"
      };
      if (effectiveToken) {
        ghHeaders["Authorization"] = `Bearer ${effectiveToken}`;
      }

      const ghRes = await fetch("/api/github_proxy/user", { headers: ghHeaders });
      const latency = Date.now() - ghStart;
      
      const scopes = ghRes.headers.get("x-oauth-scopes") || "なし / Fine-grained PAT";

      if (ghRes.ok) {
        setDiagnosticsStatus(prev => ({
          ...prev,
          githubStatus: "healthy",
          githubLatency: latency
        }));
        let loginName = "";
        try {
          const ghData = await ghRes.json();
          if (ghData && typeof ghData.id === "number") {
            setGithubUser({ id: ghData.id, login: ghData.login || null });
            localStorage.setItem("gh_user_id", String(ghData.id));
            localStorage.setItem("gh_user_login", ghData.login || "");
            loginName = ghData.login;
          }
        } catch (e) {
          console.error("Failed to parse GitHub profile response:", e);
        }
        
        let warning = "";
        if (!scopes.includes("repo") && scopes !== "なし / Fine-grained PAT") {
            warning = " (警告: repoスコープが不足しています)";
        }

        setGithubStatusSummary(`接続成功 (OK) - ${loginName ? `@${loginName}` : "ユーザー"}. レテンシー: ${latency}ms. スコープ: ${scopes}${warning}`);
      } else {
        setDiagnosticsStatus(prev => ({
          ...prev,
          githubStatus: "failed",
          githubLatency: latency
        }));
        setGithubStatusSummary(`GitHub認証エラー (HTTP ${ghRes.status}). トークンの有効性と権限を確認してください。`);
      }
    } catch (e: any) {
      setDiagnosticsStatus(prev => ({
        ...prev,
        githubStatus: "failed",
        githubLatency: null
      }));
      setGithubStatusSummary(`GitHub接続失敗: ${e.message || e}`);
    } finally {
      setIsSweepingGithub(false);
    }
  };

  const runJulesDiagnostics = async () => {
    setIsSweepingJules(true);
    setJulesStatusSummary("Initiating Jules API connectivity probe...");
    let jApiKeyVal = "";
    let hasJules = false;

    try {
      if (currentUser) {
        try {
          const secretsRef = doc(db, "users", currentUser.uid);
          const secretsSnap = await getDoc(secretsRef);
          if (secretsSnap.exists()) {
            const data = secretsSnap.data();
            hasJules = !!data.julesApiKey;
            jApiKeyVal = data.julesApiKey || "";
          }
        } catch (e) {
          console.error("Jules diagnostic config load error:", e);
        }
      } else {
        const secRes = await fetch("/api/secrets");
        if (secRes.ok) {
          const secData = await secRes.json();
          hasJules = !!secData.julesApiKeyConfigured;
        }
      }

      const effectiveKey = julesApiKeyInput || jApiKeyVal;
      if (!hasJules && !effectiveKey) {
        setDiagnosticsStatus(prev => ({ ...prev, julesStatus: "not_configured" }));
        setJulesStatusSummary("Jules APIキーが未設定です。");
        setIsSweepingJules(false);
        return;
      }

      const julesStart = Date.now();
      const res = await fetch("/api/jules_proxy/v1alpha/sessions", {
        headers: { "Content-Type": "application/json" }
      });
      const latency = Date.now() - julesStart;

      if (res.ok) {
        setDiagnosticsStatus(prev => ({
          ...prev,
          julesStatus: "healthy",
          julesLatency: latency
        }));
        setJulesStatusSummary(`接続成功 (OK) - レテンシー: ${latency}ms`);
      } else {
        setDiagnosticsStatus(prev => ({
          ...prev,
          julesStatus: "failed",
          julesLatency: latency
        }));
        setJulesStatusSummary(`Jules認証エラー (HTTP ${res.status}). 設定内容を確認してください。`);
      }
    } catch (e: any) {
      setDiagnosticsStatus(prev => ({
        ...prev,
        julesStatus: "failed",
        julesLatency: null
      }));
      setJulesStatusSummary(`Jules接続失敗: ${e.message || e}`);
    } finally {
      setIsSweepingJules(false);
    }
  };

  const runDiagnosticsSweep = async () => {
    setDiagnosticsStatus(prev => ({ ...prev, isSweeping: true, statusSummary: "Initiating live diagnostic probe..." }));
    const startTime = Date.now();
    let reportLogs: string[] = [];

    try {
      await Promise.all([runGithubDiagnostics(), runJulesDiagnostics()]);

      const res = await fetch("/api/dashboards");
      if (res.ok) {
        const data = await res.json();
        const count = data.length;
        
        const secRes = await fetch("/api/secrets");
        let securityCheck: "secured" | "failed" = "secured";
        if (secRes.ok) {
          const secData = await secRes.json();
          if (secData.githubToken || secData.julesApiKey) {
            securityCheck = "failed";
          }
        } else {
          securityCheck = "failed";
        }

        const activeDash = data.find((d: any) => !d.archived);
        let polledTime = "Never";
        if (activeDash && activeDash.syncStatus && activeDash.syncStatus.polledAt) {
          polledTime = new Date(activeDash.syncStatus.polledAt).toLocaleTimeString();
        }

        const totalLatency = Date.now() - startTime;
        const finalLogsSummary = `システム診断完了 (${totalLatency}ms)`;

        setDiagnosticsStatus(prev => ({
          ...prev,
          secretsSecured: securityCheck,
          dashboardCount: count,
          lastPolledDaemon: polledTime === "Never" ? "Pending Initial Loop" : polledTime,
          statusSummary: finalLogsSummary,
          isSweeping: false
        }));
      } else {
        setDiagnosticsStatus(prev => ({
          ...prev,
          statusSummary: "ダッシュボード情報取得失敗により、システム診断を一部中断しました: HTTP " + res.status,
          isSweeping: false
        }));
      }
    } catch (err: any) {
      setDiagnosticsStatus(prev => ({
        ...prev,
        statusSummary: "システム診断中の例外発生: " + (err.message || err),
        isSweeping: false
      }));
    }
  };

  useEffect(() => {
    if (currentView === "status") {
      runDiagnosticsSweep();
    }
  }, [currentView]);

  // Selected Dashboard bindings & info
  const [githubBinding, setGithubBinding] = useState<DashboardRepoBinding | null>(null);
  const [julesBinding, setJulesBinding] = useState<DashboardJulesBinding | null>(null);
  const [chatGptLinks, setChatGptLinks] = useState<DashboardChatGptLink[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [julesSessions, setJulesSessions] = useState<any[]>([]);
  const [showArchivedJulesSessions, setShowArchivedJulesSessions] = useState(false);
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isGithubBillingModalOpen, setIsGithubBillingModalOpen] = useState(false);
  const [allRepoBindings, setAllRepoBindings] = useState<any[]>([]);
  const [allJulesSessions, setAllJulesSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [julesActivities, setJulesActivities] = useState<any[]>([]);
  const [julesActivitiesNextPageToken, setJulesActivitiesNextPageToken] = useState<string | null>(null);
  const [julesActivitiesLoading, setJulesActivitiesLoading] = useState(false);
  const [julesActivitiesOffset, setJulesActivitiesOffset] = useState(0);
  const [julesActivitiesError, setJulesActivitiesError] = useState<string | null>(null);

  const loadMoreActivities = async () => {
    if (julesActivitiesLoading || !julesActivitiesNextPageToken) return;
    setJulesActivitiesLoading(true);
    try {
      const res = await fetch(`/api/jules_sessions/${selectedSessionId}/activities?limit=20&offset=${julesActivitiesNextPageToken}`);
      const data = await res.json();
      setJulesActivities([...julesActivities, ...data.items]);
      setJulesActivitiesNextPageToken(data.nextPageToken);
      setJulesActivitiesOffset(parseInt(data.nextPageToken || "0"));
    } catch (err) {
      console.error(err);
    } finally {
      setJulesActivitiesLoading(false);
    }
  };
  const [rawActivitiesJson, setRawActivitiesJson] = useState<string>("");
  const [isRawResponseOpen, setIsRawResponseOpen] = useState(false);
  const [refreshActivitiesTrigger, setRefreshActivitiesTrigger] = useState(0);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [secondsSinceSync, setSecondsSinceSync] = useState<number | null>(null);
  const [expandedSystemLogs, setExpandedSystemLogs] = useState<Record<string, boolean>>({});
  const [githubPendingPRs, setGithubPendingPRs] = useState<any[]>([]);
  const [githubPendingPRsError, setGithubPendingPRsError] = useState<string | null>(null);
  const [isFetchingManualPRs, setIsFetchingManualPRs] = useState(false);
  const [showRawGithubPRs, setShowRawGithubPRs] = useState(false);
  const [lastGithubSyncTime, setLastGithubSyncTime] = useState<Date | null>(null);
  const [lastJulesSessionsSyncTime, setLastJulesSessionsSyncTime] = useState<Date | null>(null);
  const [prFilterOpen, setPrFilterOpen] = useState(true);
  const [prFilterDraft, setPrFilterDraft] = useState(true);
  const [prFilterMerged, setPrFilterMerged] = useState(false);

  useEffect(() => {
    setGithubPendingPRs([]);
    setGithubPendingPRsError(null);
    setLastGithubSyncTime(null);
  }, [selectedDashboardId]);

  // Keep archived sessions hidden by default unless manually toggled by user in UI
  useEffect(() => {
    if (julesSessions.length === 0) return; // Prevent clearing selectedSessionId when the list is temporarily empty or loading

    if (!selectedSessionId) {
      // If nothing is selected but we have visible sessions, auto-select the first one
      const firstVisible = julesSessions.find(sess => {
        const isArchived = sess.archived || sess.status === "archived";
        return showArchivedJulesSessions || !isArchived;
      });
      if (firstVisible) {
        setSelectedSessionId(firstVisible.id);
      }
      return;
    }
    
    // Draft sessions are kept separate
    if (selectedSessionId.startsWith("jsess-")) return;
    
    const isVisible = julesSessions.some(sess => {
      if (sess.id !== selectedSessionId) return false;
      const isArchived = sess.archived || sess.status === "archived";
      return showArchivedJulesSessions || !isArchived;
    });
    
    if (!isVisible) {
      // Find the first visible session to select instead
      const firstVisible = julesSessions.find(sess => {
        const isArchived = sess.archived || sess.status === "archived";
        return showArchivedJulesSessions || !isArchived;
      });
      
      if (firstVisible) {
        setSelectedSessionId(firstVisible.id);
      }
    }
  }, [julesSessions, showArchivedJulesSessions, selectedSessionId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsSinceSync(prev => (prev === null ? 0 : prev + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const getRelativeTimeString = (time: Date | null) => {
    if (!time) return "";
    const elapsedSeconds = Math.floor((Date.now() - time.getTime()) / 1000);
    if (elapsedSeconds < 1) {
      return "たった今";
    }
    if (elapsedSeconds < 60) {
      return `${elapsedSeconds}秒前`;
    }
    const minutes = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    if (minutes < 60) {
      return `${minutes}分${secs}秒前`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}時間${mins}分前`;
  };

  const getAbsoluteTimeString = (time: Date | null) => {
    if (!time) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    const h = pad(time.getHours());
    const m = pad(time.getMinutes());
    const s = pad(time.getSeconds());
    return `${h}:${m}:${s}`;
  };

  const handleRefreshActivities = () => {
    setRefreshActivitiesTrigger(prev => prev + 1);
  };

  // Editing Forms State
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSecretOpen, setIsSecretOpen] = useState(false);
  const [githubTokenInput, setGithubTokenInput] = useState("");
  const [julesApiKeyInput, setJulesApiKeyInput] = useState("");
  const [secretsStatus, setSecretsStatus] = useState<any>(null);

  // New Dashboard Modal
  const [isNewDashOpen, setIsNewDashOpen] = useState(false);
  const [newDashName, setNewDashName] = useState("");
  const [newDashDesc, setNewDashDesc] = useState("");
  const [newDashColor, setNewDashColor] = useState("blue");
  const [newDashIcon, setNewDashIcon] = useState("MessageSquare");

  // Repository-branch Modal selection states
  const [isOpenRepoModal, setIsOpenRepoModal] = useState(false);
    const [isDeveloperModalOpen, setIsDeveloperModalOpen] = useState(false);
  const [batchLogs, setBatchLogs] = useState<string[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

const [isOpenBranchModal, setIsOpenBranchModal] = useState(false);
  const [ghRepos, setGhRepos] = useState<any[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [repoSearchKeyword, setRepoSearchKeyword] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);
  const [ghBranches, setGhBranches] = useState<any[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [branchSearchKeyword, setBranchSearchKeyword] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  // New ChatGPT Link State
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkUrlType, setNewLinkUrlType] = useState<"private_conversation" | "shared_link">("shared_link");
  const [newLinkKind, setNewLinkKind] = useState<any>("design");
  const [newLinkDesc, setNewLinkDesc] = useState("");
  const [newLinkPinned, setNewLinkPinned] = useState(false);

  // Synchronize newLinkUrl when chatGptLinks updates (we only care about the single URL)
  useEffect(() => {
    if (chatGptLinks && chatGptLinks.length > 0) {
      setNewLinkUrl(chatGptLinks[0].url || "");
    } else {
      setNewLinkUrl("");
    }
  }, [chatGptLinks]);

  // Edit Git Binding Form state
  const [gitOwner, setGitOwner] = useState("");
  const [gitRepo, setGitRepo] = useState("");
  const [gitDefaultBranch, setGitDefaultBranch] = useState("main");
  const [gitWorkingBranch, setGitWorkingBranch] = useState("");
  const [gitRole, setGitRole] = useState<any>("primary");

  // Edit Jules Binding Form State
  const [julesSource, setJulesSource] = useState("");
  const [julesBranch, setJulesBranch] = useState("");
  const [julesApproval, setJulesApproval] = useState(true);

  // Jules Message Send State
  const [draftMessages, setDraftMessages] = useState<Record<string, string>>({}); // keeps draft message per session/dashboard
  const [isSendingJulesMessage, setIsSendingJulesMessage] = useState(false);
  const [newSessionNameInput, setNewSessionNameInput] = useState("");
  const [newSessionPromptInput, setNewSessionPromptInput] = useState("");
  const [isSpawningSession, setIsSpawningSession] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [isRegeneratingTitleId, setIsRegeneratingTitleId] = useState<string | null>(null);
  const [isRefreshingJulesSessions, setIsRefreshingJulesSessions] = useState(false);
  const [isJulesJsonCopied, setIsJulesJsonCopied] = useState(false);

  // Timeline Event Detail Overlay / Expand
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Fetch Dashboards and Secrets status

  const runAdminBatchCorrection = async () => {
    if (!currentUser || currentUser.email !== 'takashi316@gmail.com') return;
    setIsBatchRunning(true);
    setBatchLogs(["Initiating batch correction across all workspaces..."]);
    
    try {
      // 1. Fetch all dashboards
      const dashRef = collection(db, "users", currentUser.uid, "dashboards");
      const snapDash = await getDocs(dashRef);
      const allDashIds = snapDash.docs.map(d => d.id);
      
      setBatchLogs(prev => [...prev, `Found ${allDashIds.length} workspaces.`]);

      // 2. Map through dashboards, check/create julesBindings and julesSessions
      for (const dId of allDashIds) {
        setBatchLogs(prev => [...prev, `Processing workspace: ${dId}...`]);

        // Get Repo binding to find branch
        let branchName = "main";
        let repoName = "unknown";
        const repoBindRef = doc(db, "users", currentUser.uid, "repoBindings", dId);
        const repoSnap = await getDoc(repoBindRef);
        if (repoSnap.exists()) {
          branchName = repoSnap.data().workingBranch || repoSnap.data().defaultBranch || "main";
          repoName = repoSnap.data().repo || "unknown";
        }
        
        // 3. Check Jules Bindings
        const julesBindRef = doc(db, "users", currentUser.uid, "julesBindings", dId);
        const julesSnap = await getDoc(julesBindRef);
        if (!julesSnap.exists()) {
          await setDoc(julesBindRef, {
            dashboardId: dId,
            sourceName: repoName,
            defaultStartingBranch: branchName,
            requirePlanApproval: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          setBatchLogs(prev => [...prev, `  -> Created missing Jules Binding for ${dId} on branch ${branchName}`]);
        }
        
        // 4. Check if Jules Sessions exist
        const julesSessQ = query(collection(db, "users", currentUser.uid, "julesSessions"), where("dashboardId", "==", dId));
        const sessSnap = await getDocs(julesSessQ);
        if (sessSnap.empty) {
          const sessId = `jsess-${Date.now()}-${Math.floor(Math.random()*1000)}`;
          await setDoc(doc(db, "users", currentUser.uid, "julesSessions", sessId), {
            id: sessId,
            dashboardId: dId,
            name: `Assistant for ${branchName}`,
            status: "idle",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          setBatchLogs(prev => [...prev, `  -> Bootstrapped default Jules Session for branch ${branchName}`]);
        } else {
          setBatchLogs(prev => [...prev, `  -> Session already exists (${sessSnap.size} found).`]);
        }
      }
      
      setBatchLogs(prev => [...prev, "Batch execution completed successfully."]);
    } catch (e: any) {
      setBatchLogs(prev => [...prev, `ERROR: ${e.message}`]);
    } finally {
      setIsBatchRunning(false);
    }
  };

  const fetchDashboards = async (selectFirst = false) => {
    if (auth.currentUser) {
      try {
        const q = collection(db, "users", auth.currentUser.uid, "dashboards");
        const docSnaps = await getDocs(q);
        const list: any[] = [];
        docSnaps.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        list.sort((a, b) => a.sortOrder - b.sortOrder);
        setDashboards(list);
        if (list.length > 0 && (selectFirst || !selectedDashboardId)) {
          setSelectedDashboardId(list[0].id);
        }
      } catch (e) {
        console.error("Firestore loading error manually:", e);
      }
      return;
    }

    try {
      const res = await fetch("/api/dashboards");
      if (res.ok) {
        const data = await res.json();
        setDashboards(data);
        if (data.length > 0) {
          if (selectFirst || !selectedDashboardId) {
            setSelectedDashboardId(data[0].id);
          }
        }
      }
    } catch (e) {
      console.error("Error loading dashboards:", e);
    }
  };

  const fetchSecretsStatus = async () => {
    if (auth.currentUser) {
      try {
        const secretsRef = doc(db, "users", auth.currentUser.uid);
        const secretsSnap = await getDoc(secretsRef);
        if (secretsSnap.exists()) {
          const data = secretsSnap.data();
          setSecretsStatus({
            githubTokenConfigured: !!data.githubToken,
            julesApiKeyConfigured: !!data.julesApiKey,
            environmentProvided: {
              GITHUB_TOKEN: !!data.githubToken,
              JULES_API_KEY: !!data.julesApiKey
            }
          });
        } else {
          setSecretsStatus({
            githubTokenConfigured: false,
            julesApiKeyConfigured: false,
            environmentProvided: { GITHUB_TOKEN: false, JULES_API_KEY: false }
          });
        }
      } catch (e) {
        console.error("Firestore secrets load error:", e);
      }
      return;
    }

    try {
      const res = await fetch("/api/secrets");
      if (res.ok) {
        const data = await res.json();
        setSecretsStatus(data);
      }
    } catch (e) {
      console.error("Error loading secrets status:", e);
    }
  };

  // On mount or user sign-in state transition
  useEffect(() => {
    fetchDashboards(true);
    fetchSecretsStatus();
  }, [currentUser]);

  // Load ALL repoBindings and ALL julesSessions in real-time or via API fallback
  useEffect(() => {
    if (currentUser) {
      // 1. Subscribe to ALL repoBindings
      const bindingsRef = collection(db, "users", currentUser.uid, "repoBindings");
      const unsubBindings = onSnapshot(bindingsRef, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setAllRepoBindings(list);
      }, (err) => {
        console.error("Error subscribing to all repo bindings:", err);
      });

      // 2. Subscribe to ALL julesSessions
      const sessionsRef = collection(db, "users", currentUser.uid, "julesSessions");
      const unsubSessions = onSnapshot(sessionsRef, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAllJulesSessions(list);
      }, (err) => {
        console.error("Error subscribing to all jules sessions:", err);
      });

      return () => {
        unsubBindings();
        unsubSessions();
      };
    } else {
      // Fallback/local mode
      const fetchAllDataLocal = async () => {
        try {
          const [bindingsRes, sessionsRes] = await Promise.all([
            fetch("/api/repo_bindings"),
            fetch("/api/jules_sessions")
          ]);
          if (bindingsRes.ok) {
            const bindingsData = await bindingsRes.json();
            setAllRepoBindings(bindingsData);
          }
          if (sessionsRes.ok) {
            const sessionsData = await sessionsRes.json();
            setAllJulesSessions(sessionsData);
          }
        } catch (e) {
          console.error("Error fetching local bindings and sessions:", e);
        }
      };
      fetchAllDataLocal();
      const interval = setInterval(fetchAllDataLocal, 5000); // Poll local data occasionally
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  // Whenever selected dashboard changes, load bindings, link databases, and reset fields
  useEffect(() => {
    if (!selectedDashboardId) return;

    if (currentUser) {
      // Load Github binding from Firestore
      const gitRef = doc(db, "users", currentUser.uid, "repoBindings", selectedDashboardId);
      getDoc(gitRef).then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as DashboardRepoBinding;
          setGithubBinding(data);
          setGitOwner(data.owner);
          setGitRepo(data.repo);
          setGitDefaultBranch(data.defaultBranch);
          setGitWorkingBranch(data.workingBranch || "");
          setGitRole(data.role || "primary");
        } else {
          setGithubBinding(null);
          setGitOwner("");
          setGitRepo("");
          setGitDefaultBranch("main");
          setGitWorkingBranch("");
          setGitRole("primary");
        }
      }).catch(err => handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}/repoBindings/${selectedDashboardId}`));

      // Load Jules binding from Firestore
      const julesRef = doc(db, "users", currentUser.uid, "julesBindings", selectedDashboardId);
      getDoc(julesRef).then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as DashboardJulesBinding;
          setJulesBinding(data);
          setJulesSource(data.sourceName || "");
          setJulesBranch(data.defaultStartingBranch || "");
          setJulesApproval(data.requirePlanApproval ?? true);
        } else {
          setJulesBinding(null);
          setJulesSource("");
          setJulesBranch("");
          setJulesApproval(true);
        }
      }).catch(err => handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}/julesBindings/${selectedDashboardId}`));

      // Load ChatGPT Link connections (Real-time subscribe!)
      const linksQ = query(
        collection(db, "users", currentUser.uid, "chatGptLinks"),
        where("dashboardId", "==", selectedDashboardId)
      );
      const unsubLinks = onSnapshot(linksQ, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setChatGptLinks(list);
      });

      // Load Timeline Events (Real-time subscribe!)
      const timelineQ = query(
        collection(db, "users", currentUser.uid, "timelineEvents"),
        where("dashboardId", "==", selectedDashboardId)
      );
      const unsubTimeline = onSnapshot(timelineQ, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTimelineEvents(list);
      });

      // Load Jules Sessions (Real-time subscribe!)
      const julesSessionsQ = query(
        collection(db, "users", currentUser.uid, "julesSessions"),
        where("dashboardId", "==", selectedDashboardId)
      );
      const unsubSessions = onSnapshot(julesSessionsQ, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(docSnap => {
          const sId = docSnap.id;
          if (!sId.startsWith("jsess-")) {
            list.push({ id: sId, ...docSnap.data() });
          }
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setJulesSessions(list);
        setSelectedSessionId((prevId) => {
          if (prevId) {
            const stillExists = list.some(s => s.id === prevId);
            if (stillExists) return prevId;
            if (prevId.startsWith("jsess-")) return prevId;
          }
          const firstActive = list.find(s => !s.archived && s.status !== "archived");
          if (firstActive) return firstActive.id;
          if (list.length > 0 && showArchivedJulesSessions) return list[0].id;
          return "";
        });
      });

      // Mark Dashboard as Read (sets updated date to now)
      updateDoc(doc(db, "users", currentUser.uid, "dashboards", selectedDashboardId), {
        updatedAt: new Date().toISOString()
      }).catch(() => {});

      return () => {
        unsubLinks();
        unsubTimeline();
        unsubSessions();
      };
    }

    // Load github binding (fallback)
    fetch(`/api/dashboards/${selectedDashboardId}/bindings/github`)
      .then(r => r.json())
      .then(data => {
        setGithubBinding(data);
        if (data) {
          setGitOwner(data.owner);
          setGitRepo(data.repo);
          setGitDefaultBranch(data.defaultBranch);
          setGitWorkingBranch(data.workingBranch || "");
          setGitRole(data.role);
        } else {
          setGitOwner("");
          setGitRepo("");
          setGitDefaultBranch("main");
          setGitWorkingBranch("");
          setGitRole("primary");
        }
      });

    // Load jules binding (fallback)
    fetch(`/api/dashboards/${selectedDashboardId}/bindings/jules`)
      .then(r => r.json())
      .then(data => {
        setJulesBinding(data);
        if (data) {
          setJulesSource(data.sourceName || "");
          setJulesBranch(data.defaultStartingBranch || "");
          setJulesApproval(data.requirePlanApproval ?? true);
        } else {
          setJulesSource("");
          setJulesBranch("");
          setJulesApproval(true);
        }
      });

    // Load links (fallback)
    fetch(`/api/dashboards/${selectedDashboardId}/chatgpt_links`)
      .then(r => r.json())
      .then(data => setChatGptLinks(data));

    // Load timeline (fallback)
    fetch(`/api/dashboards/${selectedDashboardId}/timeline`)
      .then(r => r.json())
      .then(data => setTimelineEvents(data));

    // Load Jules sessions (fallback)
    fetch(`/api/dashboards/${selectedDashboardId}/jules_sessions`)
      .then(r => r.json())
      .then(data => {
        const filtered = (data || []).filter((s: any) => s && s.id && !s.id.startsWith("jsess-"));
        setJulesSessions(filtered);
        const firstActive = filtered.find((s: any) => !s.archived && s.status !== "archived");
        if (firstActive) {
          setSelectedSessionId(firstActive.id);
        } else if (filtered.length > 0 && showArchivedJulesSessions) {
          setSelectedSessionId(filtered[0].id);
        } else {
          setSelectedSessionId("");
          setJulesActivities([]);
        }
      });

    // Mark as Read POST on server (clears unread badge) (fallback)
    fetch(`/api/dashboards/${selectedDashboardId}/read`, { method: "POST" })
      .then(() => {
        // Refresh dashboard statistics
        fetch(`/api/dashboards`)
          .then(r => r.json())
          .then(data => setDashboards(data));
      });

  }, [selectedDashboardId, currentUser]);

  // Whenever selected Jules session changes, load activities
  useEffect(() => {
    if (!selectedSessionId) {
      setJulesActivities([]);
      setRawActivitiesJson("");
      setJulesActivitiesError(null);
      setIsLoadingActivities(false);
      return;
    }

    setIsLoadingActivities(true);
    setJulesActivitiesError(null);

    const loadRealActivities = async (): Promise<boolean> => {
      setIsLoadingActivities(true);
      try {
        if (selectedSessionId.startsWith("jsess-")) return false;
        // Clean session ID (without prefix "sessions/") for Firestore & local endpoints
        const rawSessId = selectedSessionId.replace(/^sessions\//, "");
        // Prefix with "sessions/" specifically for Remote Jules API Proxy URLs
        const cleanSessId = `sessions/${rawSessId}`;
        const timestamp = Date.now();
        console.log(`[Client] Fetching session activities for remote ID: ${cleanSessId}, local raw ID: ${rawSessId}`);

        const fetchSafely = async (url: string) => {
          try {
            return await fetch(url, { 
              headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache"
              } 
            });
          } catch (err: any) {
            console.warn(`[Client] Safe fetch intercepted error for ${url}:`, err.message || err);
            return {
              ok: false,
              status: 503,
              statusText: "Server initializing or offline",
              json: async () => ({})
            } as any;
          }
        };

        const [res, sessRes] = await Promise.all([
          fetchSafely(`/api/jules_proxy/v1alpha/${cleanSessId}/activities?t=${timestamp}`),
          fetchSafely(`/api/jules_proxy/v1alpha/${cleanSessId}?t=${timestamp}`)
        ]);

        if (res.ok) {
          const initialData = await res.json();
          const remoteActs: any[] = [];
          if (initialData.activities && Array.isArray(initialData.activities)) {
            remoteActs.push(...initialData.activities);
          }

          let pageToken = initialData.nextPageToken;
          let pageCount = 1;
          
          while (pageToken && pageCount < 20) {
            let url = "";
            try {
              url = `/api/jules_proxy/v1alpha/${cleanSessId}/activities?t=${Date.now()}&pageToken=${encodeURIComponent(pageToken)}`;
              console.log(`[Client] Fetching activities URL: ${url}`);
              const pageRes = await fetchSafely(url);
              if (pageRes.ok) {
                const pageData = await pageRes.json();
                if (pageData.activities && Array.isArray(pageData.activities)) {
                  remoteActs.push(...pageData.activities);
                }
                pageToken = pageData.nextPageToken;
                pageCount++;
              } else {
                const errorMsg = `Failed to fetch activities page ${pageCount + 1}, status: ${pageRes.status}, URL: ${url}. Displaying partially loaded history (${remoteActs.length} items).`;
                console.warn(errorMsg);
                setJulesActivitiesError(errorMsg);
                break;
              }
            } catch (err: any) {
              const errorMsg = `Error fetching activities page ${pageCount + 1}: ${err.message || err}. Displaying partially loaded history (${remoteActs.length} items).`;
              console.warn(errorMsg);
              setJulesActivitiesError(errorMsg);
              break;
            }
          }

          const list: any[] = [];
          
          let sessData: any = null;
          if (sessRes.ok) {
            sessData = await sessRes.json();
            
            if (sessData.title) {
              const sessionInState = julesSessions.find(s => s.id === rawSessId || s.id === selectedSessionId);
              let isAppGenerated = sessionInState?.isAppGeneratedTitle || false;

              if (currentUser && !isAppGenerated) {
                try {
                  const sesRef = doc(db, "users", currentUser.uid, "julesSessions", rawSessId);
                  const sesSnap = await getDoc(sesRef);
                  if (sesSnap.exists() && sesSnap.data().isAppGeneratedTitle) {
                    isAppGenerated = true;
                  }
                } catch (err) {
                  console.warn("Failed to check isAppGeneratedTitle from Firestore:", err);
                }
              }

              const fullData: any = {
                id: rawSessId,
                dashboardId: selectedDashboardId,
                name: parseJulesTitle(sessData.title, `Agent Session ${rawSessId.substring(0, 6)}...`),
                status: sessData.state || 'UNKNOWN',
                creatorWebUrl: sessData.creatorWebUrl || "",
                createdAt: sessData.createTime || new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              if (isAppGenerated) {
                delete fullData.name;
              }

              if (currentUser) {
                try {
                  const sesRef = doc(db, "users", currentUser.uid, "julesSessions", rawSessId);
                  await setDoc(sesRef, fullData, { merge: true });
                } catch (e) {
                  console.error("Failed to upsert session details in Firestore:", e);
                }
              }

              try {
                await fetch(`/api/jules_sessions/${rawSessId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(fullData)
                });
              } catch (localErr) {
                console.error("Failed to update local db session:", localErr);
              }
            }

            if (sessData.prompt) {
               list.push({
                  id: `${selectedSessionId}-initial-prompt`,
                  type: 'user_message',
                  sessionId: selectedSessionId,
                  text: sessData.prompt,
                  createdAt: sessData.createTime || new Date(0).toISOString(),
                  originator: 'user'
               });
            }
          }

          // Capture the raw JSON response payload from Jules API
          setRawActivitiesJson(JSON.stringify({
            sessionDetails: sessData,
            activitiesPayload: {
              activities: remoteActs,
              pageCount,
              originalPayload: initialData
            }
          }, null, 2));

          for (const a of remoteActs) {
            if (a.agentMessaged) {
              list.push({
                id: a.name || a.id,
                type: 'agent_message',
                sessionId: selectedSessionId,
                text: a.agentMessaged.agentMessage || "",
                createdAt: a.createTime,
                originator: a.originator,
                raw: a
              });
            } else if (a.userMessaged) {
              list.push({
                id: a.name || a.id,
                type: 'user_message',
                sessionId: selectedSessionId,
                text: a.userMessaged.userMessage || "",
                createdAt: a.createTime,
                originator: a.originator,
                raw: a
              });
            } else if (a.planGenerated) {
              const plan = a.planGenerated.plan;
              const titleText = plan?.steps?.map((s: any) => `- ${s.title}\n  ${s.description}`).join('\n') || "Empty plan";
              list.push({
                id: a.name || a.id,
                type: 'agent_message',
                sessionId: selectedSessionId,
                text: `Generated Plan:\n${titleText}`,
                createdAt: a.createTime,
                originator: a.originator || 'agent',
                raw: a
              });
            } else if (a.planApproved) {
              list.push({
                id: a.name || a.id,
                type: 'user_message',
                sessionId: selectedSessionId,
                text: `Approved Plan ID: ${a.planApproved.planId}`,
                createdAt: a.createTime,
                originator: a.originator || 'user',
                raw: a
              });
            } else if (a.pullRequestCreated || a.pullRequestMessaged) {
              const prData = a.pullRequestCreated || a.pullRequestMessaged;
              list.push({
                id: a.name || a.id,
                type: 'pull_request',
                sessionId: selectedSessionId,
                text: prData.message || prData.text || prData.pullRequestMessage || "Pull request created",
                url: prData.url || prData.pullRequestUrl || prData.html_url,
                createdAt: a.createTime,
                originator: a.originator,
                raw: a
              });
            } else if (a.codeCommitted || a.branchUpdated) {
              const commitData = a.codeCommitted || a.branchUpdated;
              const textValue = commitData.message || commitData.text || commitData.commitMessage || "Code committed to branch";
              if (!list.some(existing => existing.type === "branch_updated" && existing.text === textValue)) {
                list.push({
                  id: a.name || a.id,
                  type: "branch_updated",
                  sessionId: selectedSessionId,
                  text: textValue,
                  url: commitData.url || commitData.commitUrl || commitData.branchUrl || commitData.html_url,
                  createdAt: a.createTime,
                  originator: a.originator,
                  raw: a
                });
              }
            } else if (a.logMessaged) {
              const textValue = a.logMessaged.text || a.logMessaged.message || "System log";
              if (!list.some(existing => existing.type === "system_log" && existing.text === textValue)) {
                list.push({
                  id: a.name || a.id,
                  type: "system_log",
                  sessionId: selectedSessionId,
                  text: textValue,
                  createdAt: a.createTime,
                  originator: a.originator,
                  raw: a
                });
              }
            } else if (a.progressUpdated) {
              const pData = a.progressUpdated;
              const title = pData.title || "";
              const description = pData.description || "";
              const textValue = [title, description].filter(Boolean).join("\n");
              if (textValue && !list.some(existing => existing.type === "system_log" && existing.text === textValue)) {
                list.push({
                  id: a.name || a.id,
                  type: "system_log",
                  sessionId: selectedSessionId,
                  text: textValue,
                  createdAt: a.createTime,
                  originator: a.originator || "agent",
                  raw: a
                });
              }
            }
          }
 
          if (sessData && sessData.outputs && Array.isArray(sessData.outputs)) {
            for (let i = 0; i < sessData.outputs.length; i++) {
              const out = sessData.outputs[i];
              if (out.changeSet?.gitPatch?.unidiffPatch) {
                const filesChanged: string[] = [];
                const diffMatches = out.changeSet.gitPatch.unidiffPatch.matchAll(/(?:\+\+\+ b\/)([^\s]+)/g);
                for (const match of diffMatches) {
                  if (match[1] && !filesChanged.includes(match[1])) {
                     filesChanged.push(match[1]);
                  }
                }
                if (filesChanged.length > 0) {
                  list.push({
                    id: `${selectedSessionId}-final-patch-${i}`,
                    type: "branch_updated",
                    sessionId: selectedSessionId,
                    text: `✅ Final Changeset Ready:\n${filesChanged.map(f => `• ${f}`).join("\n")}`,
                    url: out.changeSet.url,
                    createdAt: sessData.updateTime || sessData.createTime || new Date().toISOString(),
                    originator: "agent",
                    patch: out.changeSet.gitPatch.unidiffPatch,
                    raw: out
                  });
                }
              }
              if (out.pullRequest) {
                list.push({
                  id: `${selectedSessionId}-final-pr-${i}`,
                  type: "pull_request",
                  sessionId: selectedSessionId,
                  text: out.pullRequest.title ? `🎉 PR Created: ${out.pullRequest.title}` : "🎉 Final Pull Request Created",
                  url: out.pullRequest.url || out.pullRequest.html_url,
                  createdAt: sessData.updateTime || sessData.createTime || new Date().toISOString(),
                  originator: "agent",
                  raw: out
                });
              }
            }
          }

          list.sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          
          if (list.length > 0) {
             setJulesActivities(list);
             setLastSyncTime(new Date());
             return true;
          }
        } else {
          const errText = `Failed to connect with Jules API proxy (Status: ${res.status}). Service may be rate-limited, undergoing maintenance, or scaling. Falling back to local cached activities.`;
          console.warn(errText);
          setJulesActivitiesError(errText);
        }
      } catch (e: any) {
        const errMsg = `Failed to load real activities: ${e.message || e}`;
        console.warn(errMsg);
        setJulesActivitiesError(errMsg);
      }
      return false;
    };

    const rawSessId = selectedSessionId.replace(/^sessions\//, "");

    let unsubscribe: any = null;
    let fallbackToFirestore = () => {
      if (currentUser) {
        const q = query(
          collection(db, "users", currentUser.uid, "julesActivities"),
          where("sessionId", "==", rawSessId)
        );
        unsubscribe = onSnapshot(q, (snapshot) => {
          const list: any[] = [];
          
          if (rawSessId.startsWith("jsess-")) {
            const sess = julesSessions.find(s => s.id === rawSessId);
            if (sess) {
              list.push({
                id: `${rawSessId}-local-prompt`,
                type: 'user_message',
                sessionId: rawSessId,
                text: sess.name,
                createdAt: sess.createdAt || new Date(0).toISOString(),
                originator: 'user'
              });
            }
          }
          
          snapshot.forEach(docSnap => {
            list.push({ id: docSnap.id, ...docSnap.data() });
          });
          list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          setJulesActivities(list);
          setRawActivitiesJson(JSON.stringify(list, null, 2));
          setIsLoadingActivities(false);
          setLastSyncTime(new Date());
        }, (err) => {
          console.error("onSnapshot error:", err);
          setIsLoadingActivities(false);
        });
      } else {
        fetch(`/api/jules_sessions/${rawSessId}/activities?limit=20&offset=0`)
          .then(r => r.json())
          .then(data => {
            setJulesActivities(data.items);
            setJulesActivitiesNextPageToken(data.nextPageToken);
            setRawActivitiesJson(JSON.stringify(data.items, null, 2));
            setLastSyncTime(new Date());
          })
          .catch(err => {
            console.error("fallback API activities error:", err);
          })
          .finally(() => {
            setIsLoadingActivities(false);
          });      }
    };

    loadRealActivities().then(usedReal => {
      if (!usedReal) {
         fallbackToFirestore();
      } else {
         setIsLoadingActivities(false);
      }
    }).catch(err => {
      console.error("Load real activities rejected catch flag:", err);
      setIsLoadingActivities(false);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedSessionId, currentUser, refreshActivitiesTrigger]);

  // Client-Side Github API & Timeline Poller
  const triggerClientSync = async () => {
    if (!auth.currentUser) return;
    setIsSyncing(true);
    try {
      const secretsRef = doc(db, "users", auth.currentUser.uid);
      const secretsSnap = await getDoc(secretsRef);
      if (!secretsSnap.exists()) {
        setIsSyncing(false);
        return;
      }
      const secretsData = secretsSnap.data();
      const rawToken = secretsData.githubToken;
      if (!rawToken) {
        setIsSyncing(false);
        return;
      }
      
      const token = rawToken.replace(/^(Bearer|token)\s+/i, "").trim().replace(/[\r\n\t]/g, "");
      if (!token) {
        setIsSyncing(false);
        return;
      }

      // Read repoBindings of all dashboards
      const bindingsRef = collection(db, "users", auth.currentUser.uid, "repoBindings");
      const bindingsSnap = await getDocs(bindingsRef);

      for (const bindingDoc of bindingsSnap.docs) {
        const binding = bindingDoc.data() as DashboardRepoBinding;
        const { dashboardId, owner, repo, defaultBranch, workingBranch } = binding;
        const targetBranch = workingBranch || defaultBranch;

        if (!owner || !repo) continue;

        const fetchGithub = async (endpoint: string) => {
          const url = `/api/github_proxy${endpoint}`;
          const r = await fetch(url, {
            headers: {
              "Accept": "application/vnd.github+json",
              "Authorization": `Bearer ${token}`
            }
          });
          if (!r.ok) {
            let errorMsg = r.statusText;
            try {
              const errBody = await r.json();
              if (errBody && errBody.message) {
                errorMsg = errBody.message;
              } else if (errBody && errBody.error) {
                errorMsg = errBody.error;
              }
            } catch (_) {}
            throw new Error(`GitHub API Error (${r.status}): ${errorMsg}`);
          }
          return await r.json();
        };

        try {
          try {
            // Poll HEAD commit
            const headData = await fetchGithub(`/repos/${owner}/${repo}/commits/${targetBranch}`);
            if (headData) {
              const commitSha = headData.sha;
              const commitMsg = headData.commit?.message || "No message";
              const committerName = headData.commit?.author?.name || "Unknown";

              const evId = `ev-commit-${commitSha.substring(0, 10)}`;
              const headEvRef = doc(db, "users", auth.currentUser.uid, "timelineEvents", evId);
              const headEvSnap = await getDoc(headEvRef);
              if (!headEvSnap.exists()) {
                await setDoc(headEvRef, {
                  id: evId,
                  dashboardId,
                  source: "github",
                  kind: "branch_head_changed",
                  severity: "success",
                  requiresUserAction: false,
                  title: `Branch '${targetBranch}' HEAD updated`,
                  body: `Commit ${commitSha.substring(0, 8)} by ${committerName}: "${commitMsg}"`,
                  externalUrl: headData.html_url,
                  createdAt: new Date().toISOString()
                });
              }
            }
          } catch(e) { console.warn("Failed to poll HEAD:", e); }

          try {
            // Poll Open PRs
            const prsData = await fetchGithub(`/repos/${owner}/${repo}/pulls?state=open&per_page=3`);
            if (prsData && Array.isArray(prsData)) {
              for (const pr of prsData) {
                const evId = `ev-pr-${pr.id}`;
                const prEvRef = doc(db, "users", auth.currentUser.uid, "timelineEvents", evId);
                const prEvSnap = await getDoc(prEvRef);
                if (!prEvSnap.exists()) {
                  await setDoc(prEvRef, {
                    id: evId,
                    dashboardId,
                    source: "github",
                    kind: "pull_request_opened",
                    severity: "info",
                    requiresUserAction: false,
                    title: `PR Opened: #${pr.number} - ${pr.title}`,
                    body: `PR created by ${pr.user?.login || "unknown"} in ${owner}/${repo}`,
                    externalUrl: pr.html_url,
                    createdAt: new Date().toISOString()
                  });
                }
              }
            }
          } catch(e) { console.warn("Failed to poll PRs:", e); }

          if (selectedDashboardId === dashboardId) {
            try {
              const openPRs = await fetchGithub(`/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=10&t=${Date.now()}`);
              const allPRsRaw = Array.isArray(openPRs) ? openPRs : [];
              const uniquePRsMap = new Map();
              allPRsRaw.forEach(pr => {
                if (pr && pr.id) uniquePRsMap.set(pr.id, pr);
              });
              const prArray = Array.from(uniquePRsMap.values());
              prArray.sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
              // Add a debug entry if empty
              if (prArray.length === 0) {
                 prArray.push({
                   _debug: true,
                   title: "Debug PR Request",
                   url_called: `/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=10`,
                   raw_response: openPRs
                 });
              }
              setGithubPendingPRs(prArray);
              setGithubPendingPRsError(null);
              setLastGithubSyncTime(new Date());
            } catch (err: any) {
              console.warn("Failed to fetch target pending PRs:", err);
              setGithubPendingPRsError(err.message || String(err));
            }
          }

          try {
            // Poll Workflow runs
            const workflowsData = await fetchGithub(`/repos/${owner}/${repo}/actions/runs?per_page=3`);
            if (workflowsData && workflowsData.workflow_runs && Array.isArray(workflowsData.workflow_runs)) {
              for (const run of workflowsData.workflow_runs) {
                let severity: "info" | "success" | "warning" | "error" = "info";
                let kind = "workflow_run_started";
                let requiresUserAction = false;

                if (run.status === "completed") {
                  if (run.conclusion === "success") {
                    severity = "success";
                    kind = "workflow_run_succeeded";
                  } else {
                    severity = "error";
                    kind = "workflow_run_failed";
                    requiresUserAction = true;
                  }
                }

                const evId = `ev-wf-${run.id}`;
                const wfEvRef = doc(db, "users", auth.currentUser.uid, "timelineEvents", evId);
                const wfEvSnap = await getDoc(wfEvRef);
                if (!wfEvSnap.exists()) {
                  await setDoc(wfEvRef, {
                    id: evId,
                    dashboardId,
                    source: "github",
                    kind,
                    severity,
                    requiresUserAction,
                    title: `Workflow ${run.name} #${run.run_number} ${run.status === "completed" ? run.conclusion : "started"}`,
                    body: `Triggered by ${run.triggering_actor?.login || "actor"}`,
                    externalUrl: run.html_url,
                    createdAt: new Date().toISOString()
                  });
                }
              }
            }
          } catch(e) { console.warn("Failed to poll Workflows:", e); }
          
          await updateDoc(doc(db, "users", auth.currentUser.uid, "dashboards", dashboardId), {
            syncStatus: { success: true, polledAt: new Date().toISOString() }
          });
        } catch(e: any) {
          console.error("Dashboard sync error:", e);
          await updateDoc(doc(db, "users", auth.currentUser.uid, "dashboards", dashboardId), {
            syncStatus: { success: false, error: e.message, polledAt: new Date().toISOString() }
          });
        }
      }
    } catch (err) {
      console.error("Client sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const forceRefreshPRs = async () => {
    if (!auth.currentUser || !githubBinding) return;
    setIsFetchingManualPRs(true);
    setGithubPendingPRsError(null);
    try {
       const secretsRef = doc(db, "users", auth.currentUser.uid);
       const secretsSnap = await getDoc(secretsRef);
       if (!secretsSnap.exists()) return;
       const rawToken = secretsSnap.data().githubToken;
       if (!rawToken) return;
       const token = rawToken.replace(/^(Bearer|token)\s+/i, "").trim().replace(/[\r\n\t]/g, "");
       if (!token) return;

       const url = `/api/github_proxy/repos/${githubBinding.owner}/${githubBinding.repo}/pulls?state=all&sort=updated&direction=desc&per_page=10&t=${Date.now()}`;
       const r = await fetch(url, {
         headers: {
           "Accept": "application/vnd.github+json",
           "Authorization": `Bearer ${token}`
         }
       });
       if (!r.ok) {
         setGithubPendingPRsError(r.statusText);
       } else {
         const openPRs = await r.json();
         const allPRsRaw = Array.isArray(openPRs) ? openPRs : [];
         const uniquePRsMap = new Map();
         allPRsRaw.forEach(pr => {
           if (pr && pr.id) uniquePRsMap.set(pr.id, pr);
         });
         const prArray = Array.from(uniquePRsMap.values());
         prArray.sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
         setGithubPendingPRs(prArray);
         setGithubPendingPRsError(null);
         setLastGithubSyncTime(new Date());
       }
    } catch (e: any) {
      setGithubPendingPRsError(e.message || String(e));
    } finally {
      setIsFetchingManualPRs(false);
    }
  };

  useEffect(() => {
    if (githubBinding && currentView === "dashboard") {
      forceRefreshPRs();
    }
  }, [githubBinding]);

  // Run initial or interval background sync on client
  useEffect(() => {
    if (!currentUser) return;
    // Initial loop execution
    setTimeout(() => {
      triggerClientSync();
    }, 2000);

    const interval = setInterval(() => {
      triggerClientSync();
    }, 60000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // GitHub Secrets updating
  const handleSaveGithubSecrets = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser) {
      try {
        const cleanedToken = (githubTokenInput || "").replace(/^(Bearer|token)\s+/i, "").trim().replace(/[\r\n\t]/g, "");
        const secretsRef = doc(db, "users", currentUser.uid);
        await setDoc(secretsRef, {
          githubToken: cleanedToken || "",
          updatedAt: new Date().toISOString()
        }, { merge: true });

        setGithubTokenInput("");
        fetchSecretsStatus();
        alert("GitHub TokenをFirestoreに安全に保存しました。");
      } catch (err) {
        console.error("Error saving Firestore GitHub secrets:", err);
      }
      return;
    }

    try {
      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubToken: githubTokenInput || undefined
        })
      });
      if (res.ok) {
        setGithubTokenInput("");
        fetchSecretsStatus();
        alert("GitHub Tokenをローカルサーバーに安全に保存しました。");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Jules Secrets updating
  const handleSaveJulesSecrets = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser) {
      try {
        const secretsRef = doc(db, "users", currentUser.uid);
        await setDoc(secretsRef, {
          julesApiKey: julesApiKeyInput || "",
          updatedAt: new Date().toISOString()
        }, { merge: true });

        setJulesApiKeyInput("");
        fetchSecretsStatus();
        alert("Jules API KeyをFirestoreに安全に保存しました。");
      } catch (err) {
        console.error("Error saving Firestore Jules secrets:", err);
      }
      return;
    }

    try {
      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          julesApiKey: julesApiKeyInput || undefined
        })
      });
      if (res.ok) {
        setJulesApiKeyInput("");
        fetchSecretsStatus();
        alert("Jules API Keyをローカルサーバーに安全に保存しました。");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch user's GitHub Repositories via the node backend proxy
  const fetchGithubRepos = async () => {
    setLoadingRepos(true);
    setReposError(null);
    try {
      let headers: any = {};
      if (currentUser) {
        const secretsRef = doc(db, "users", currentUser.uid);
        const secSnap = await getDoc(secretsRef);
        if (secSnap.exists()) {
          const secData = secSnap.data();
          if (secData.githubToken) {
            headers["Authorization"] = `Bearer ${secData.githubToken}`;
          }
        }
      }

      const res = await fetch("/api/github/repos", { headers });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status} error fetching repositories`);
      }
      const data = await res.json();
      setGhRepos(data);
    } catch (err: any) {
      console.error(err);
      setReposError(err.message || "Failed to load GitHub repositories.");
    } finally {
      setLoadingRepos(false);
    }
  };

  // Fetch branches for selected repo
  const fetchGithubBranches = async (owner: string, repoName: string) => {
    setLoadingBranches(true);
    setBranchesError(null);
    try {
      let headers: any = {};
      if (currentUser) {
        const secretsRef = doc(db, "users", currentUser.uid);
        const secSnap = await getDoc(secretsRef);
        if (secSnap.exists()) {
          const secData = secSnap.data();
          if (secData.githubToken) {
            headers["Authorization"] = `Bearer ${secData.githubToken}`;
          }
        }
      }

      const res = await fetch(`/api/github/branches?owner=${owner}&repo=${repoName}`, { headers });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status} error fetching branches`);
      }
      const data = await res.json();
      setGhBranches(data);
    } catch (err: any) {
      console.error(err);
      setBranchesError(err.message || "Failed to load branches.");
    } finally {
      setLoadingBranches(false);
    }
  };

  // Automated creation and duplicate validation flow
  const handleSelectBranchAndCreateWorkspace = async (branchName: string) => {
    if (!selectedRepo) return;
    setIsCreatingWorkspace(true);

    try {
      const owner = selectedRepo.owner.login;
      const repo = selectedRepo.name;

      // 1. Duplicate check (same owner, repo, branch) across active dashboards
      let existingBindingsCheck: any[] = [];
      if (currentUser) {
        try {
          const snap = await getDocs(collection(db, "users", currentUser.uid, "repoBindings"));
          snap.forEach(d => {
            existingBindingsCheck.push(d.data());
          });
        } catch (e) {
          console.error("Firestore getBindings failed during duplicates check:", e);
        }
      } else {
        const res = await fetch("/api/repo_bindings");
        if (res.ok) {
          existingBindingsCheck = await res.json();
        }
      }

      const duplicateExists = existingBindingsCheck.some(b => {
        const targetBranch = b.workingBranch || b.defaultBranch;
        return (
          b.owner.toLowerCase() === owner.toLowerCase() &&
          b.repo.toLowerCase() === repo.toLowerCase() &&
          targetBranch?.toLowerCase() === branchName.toLowerCase()
        );
      });

      if (duplicateExists) {
        alert(`This branch (${branchName}) of ${owner}/${repo} is already registered as a workspace. Duplicate entries are not allowed.`);
        setIsCreatingWorkspace(false);
        return;
      }

      // 2. Automated randomized brand configuration
      const colors = ["blue", "emerald", "purple", "indigo", "rose", "amber"];
      const icons = ["MessageSquare", "Cpu", "Settings", "Github", "ExternalLink"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const randomIcon = icons[Math.floor(Math.random() * icons.length)];

      const dashName = `${repo} (${branchName})`;
      const dashDesc = `Automated workspace tracking branch ${branchName} of GitHub repository ${owner}/${repo}.`;
      const uuid = `db-${Date.now()}`;

      if (currentUser) {
        // Create Dashboard Document
        const dashDocRef = doc(db, "users", currentUser.uid, "dashboards", uuid);
        await setDoc(dashDocRef, {
          id: uuid,
          name: dashName,
          slug: dashName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          description: dashDesc,
          color: randomColor,
          icon: randomIcon,
          sortOrder: dashboards.length + 1,
          pinned: false,
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Create Repo Binding Document
        const repoBindingRef = doc(db, "users", currentUser.uid, "repoBindings", uuid);
        await setDoc(repoBindingRef, {
          id: `repo-${Date.now()}`,
          dashboardId: uuid,
          provider: "github",
          owner,
          repo,
          defaultBranch: selectedRepo.default_branch || "main",
          workingBranch: branchName,
          role: "primary",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Immediate poll
        
        // Automate generation of default Jules Session and Jules Binding for this branch
        const julesBindingRef = doc(db, "users", currentUser.uid, "julesBindings", uuid);
        await setDoc(julesBindingRef, {
          dashboardId: uuid,
          sourceName: repo,
          defaultStartingBranch: branchName,
          requirePlanApproval: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        const sessId = `jsess-${Date.now()}`;
        const initialJulesSessRef = doc(db, "users", currentUser.uid, "julesSessions", sessId);
        await setDoc(initialJulesSessRef, {
          id: sessId,
          dashboardId: uuid,
          name: `Agent ${branchName}`,
          status: "idle",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        triggerClientSync().catch(console.error);

        setIsOpenBranchModal(false);
        setIsOpenRepoModal(false);
        setRepoSearchKeyword("");
        setBranchSearchKeyword("");
        
        setSelectedDashboardId(uuid);
        setCurrentView("dashboard");
        await fetchDashboards();
        alert(`Workspace spun up successfully: ${dashName}`);
      } else {
        // Create REST API Dashboard
        const resDash = await fetch("/api/dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: dashName,
            description: dashDesc,
            color: randomColor,
            icon: randomIcon
          })
        });

        if (!resDash.ok) {
          throw new Error("Failed to create dashboard on local backend API");
        }

        const newDash = await resDash.json();

        // Create REST API Binding
        const resBind = await fetch(`/api/dashboards/${newDash.id}/bindings/github`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner,
            repo,
            defaultBranch: selectedRepo.default_branch || "main",
            workingBranch: branchName,
            role: "primary"
          })
        });

        if (!resBind.ok) {
          throw new Error("Failed to register Github repository binding on local backend API");
        }

        setIsOpenBranchModal(false);
        setIsOpenRepoModal(false);
        setRepoSearchKeyword("");
        setBranchSearchKeyword("");
        
        setSelectedDashboardId(newDash.id);
        setCurrentView("dashboard");
        await fetchDashboards();
        alert(`Workspace spun up successfully: ${dashName}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error spinning workspace: ${err.message || err}`);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  // Create Dashboard
  const handleCreateDashboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDashName.trim()) return;

    if (currentUser) {
      try {
        const uuid = `db-${Date.now()}`;
        const docRef = doc(db, "users", currentUser.uid, "dashboards", uuid);
        await setDoc(docRef, {
          id: uuid,
          name: newDashName,
          slug: newDashName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          description: newDashDesc,
          color: newDashColor,
          icon: newDashIcon,
          sortOrder: dashboards.length + 1,
          pinned: false,
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        setNewDashName("");
        setNewDashDesc("");
        setIsNewDashOpen(false);
        setSelectedDashboardId(uuid);
        setCurrentView("dashboard");
        alert("Workspace dashboard spun up successfully.");
      } catch (err) {
        console.error("Firestore dashboard create failed:", err);
      }
      return;
    }

    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newDashName,
          description: newDashDesc,
          color: newDashColor,
          icon: newDashIcon
        })
      });
      if (res.ok) {
        const item = await res.json();
        setNewDashName("");
        setNewDashDesc("");
        setIsNewDashOpen(false);
        await fetchDashboards();
        setSelectedDashboardId(item.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Create or Update Single ChatGPT Link (No title, kind, sharing type or descriptions)
  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkUrl) return;

    const uuid = `chatgpt-link-${selectedDashboardId}`;

    if (currentUser) {
      try {
        const docRef = doc(db, "users", currentUser.uid, "chatGptLinks", uuid);
        await setDoc(docRef, {
          id: uuid,
          dashboardId: selectedDashboardId,
          title: "ChatGPT Connection",
          url: newLinkUrl,
          urlType: "shared_link",
          kind: "misc",
          description: "Attached single ChatGPT context thread.",
          pinned: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Firestore write ChatGPT link failed:", err);
      }
      return;
    }

    try {
      const existingLink = chatGptLinks && chatGptLinks.length > 0 ? chatGptLinks[0] : null;
      if (existingLink) {
        const res = await fetch(`/api/dashboards/${selectedDashboardId}/chatgpt_links/${existingLink.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "ChatGPT Connection",
            url: newLinkUrl,
            urlType: "shared_link",
            kind: "misc",
            description: "Attached single ChatGPT context thread.",
            pinned: true
          })
        });
        if (res.ok) {
          const r = await fetch(`/api/dashboards/${selectedDashboardId}/chatgpt_links`);
          const data = await r.json();
          setChatGptLinks(data);
        }
      } else {
        const res = await fetch(`/api/dashboards/${selectedDashboardId}/chatgpt_links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "ChatGPT Connection",
            url: newLinkUrl,
            urlType: "shared_link",
            kind: "misc",
            description: "Attached single ChatGPT context thread.",
            pinned: true
          })
        });
        if (res.ok) {
          const r = await fetch(`/api/dashboards/${selectedDashboardId}/chatgpt_links`);
          const data = await r.json();
          setChatGptLinks(data);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Open ChatGPT URL tracker
  const handleOpenLink = async (link: DashboardChatGptLink, targetName: string = "_blank") => {
    window.open(link.url, targetName);

    if (currentUser) {
      try {
        const docRef = doc(db, "users", currentUser.uid, "chatGptLinks", link.id);
        await updateDoc(docRef, {
          lastOpenedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Trigger dynamic timeline item log
        const eventId = `ev-link-open-${Date.now()}`;
        await setDoc(doc(db, "users", currentUser.uid, "timelineEvents", eventId), {
          id: eventId,
          dashboardId: selectedDashboardId,
          source: "chatgpt_link",
          kind: "chatgpt_link_opened",
          severity: "info",
          requiresUserAction: false,
          title: `ChatGPT Thread Opened`,
          body: `Opened: "${link.url}"`,
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Firestore ChatGPT tracker error:", err);
      }
      return;
    }

    try {
      await fetch(`/api/dashboards/${selectedDashboardId}/chatgpt_links/${link.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastOpenedAt: new Date().toISOString() })
      });
      const r = await fetch(`/api/dashboards/${selectedDashboardId}/chatgpt_links`);
      const data = await r.json();
      setChatGptLinks(data);

      // Refresh timeline stream
      const rawTim = await fetch(`/api/dashboards/${selectedDashboardId}/timeline`);
      const events = await rawTim.json();
      setTimelineEvents(events);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!confirm("Are you sure you want to decouple this ChatGPT URL?")) return;

    if (currentUser) {
      try {
        const docRef = doc(db, "users", currentUser.uid, "chatGptLinks", linkId);
        await deleteDoc(docRef);
      } catch (err) {
        console.error("Firestore delete link failed:", err);
      }
      return;
    }

    try {
      const res = await fetch(`/api/dashboards/${selectedDashboardId}/chatgpt_links/${linkId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setChatGptLinks(prev => prev.filter(l => l.id !== linkId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Save Git Binding
  const handleSaveGitBinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser) {
      try {
        const docRef = doc(db, "users", currentUser.uid, "repoBindings", selectedDashboardId);
        const data = {
          dashboardId: selectedDashboardId,
          provider: "github",
          owner: gitOwner,
          repo: gitRepo,
          defaultBranch: gitDefaultBranch,
          workingBranch: gitWorkingBranch || "",
          role: gitRole,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(docRef, data);
        setGithubBinding(data as any);
        alert("GitHub binding settings saved successfully.");
        triggerClientSync();
      } catch (err) {
        console.error("Firestore save git binding failed:", err);
      }
      return;
    }

    try {
      const res = await fetch(`/api/dashboards/${selectedDashboardId}/bindings/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: gitOwner,
          repo: gitRepo,
          defaultBranch: gitDefaultBranch,
          workingBranch: gitWorkingBranch || undefined,
          role: gitRole
        })
      });
      if (res.ok) {
        const data = await res.json();
        setGithubBinding(data);
        alert("GitHub binding settings saved successfully.");
        // refresh stats
        fetchDashboards();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Save Jules Binding
  const handleSaveJulesBinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser) {
      try {
        const docRef = doc(db, "users", currentUser.uid, "julesBindings", selectedDashboardId);
        const data = {
          dashboardId: selectedDashboardId,
          sourceName: julesSource,
          defaultStartingBranch: julesBranch,
          requirePlanApproval: julesApproval,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(docRef, data);
        setJulesBinding(data as any);
        alert("Jules agent configuration saved setup.");
      } catch (err) {
        console.error("Firestore save Jules binding failed:", err);
      }
      return;
    }

    try {
      const res = await fetch(`/api/dashboards/${selectedDashboardId}/bindings/jules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceName: julesSource,
          defaultStartingBranch: julesBranch,
          requirePlanApproval: julesApproval
        })
      });
      if (res.ok) {
        const data = await res.json();
        setJulesBinding(data);
        alert("Jules agent configuration saved setup.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sync existing jules sessions from API to Firestore
  const syncJulesSessions = async () => {
    if (!currentUser || !selectedDashboardId) return;
    try {
      // 1. Get repo binding to know the repo name
      const repoBindRef = doc(db, "users", currentUser.uid, "repoBindings", selectedDashboardId);
      const repoSnap = await getDoc(repoBindRef);
      let repoName = "";
      if (repoSnap.exists()) {
        repoName = repoSnap.data().repo || "";
      }
      
      // 2. Fetch from optimized server-side minimal sync endpoint
      const res = await fetch(`/api/jules_minimal_sync?repoName=${encodeURIComponent(repoName)}`, {
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) throw new Error(`Jules API Error: ${res.status}`);
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error("Server returned HTML instead of JSON. The dev server may be restarting or the route is unavailable.");
      }
      
      const data = await res.json();
      
      const remoteSessions = data.sessions || [];
      const remoteSessionIds = new Set<string>();
      
      for (const rSess of remoteSessions) {
        remoteSessionIds.add(rSess.id);
      }
      
      // 3. Auto-archiving missing sessions with a gradual grace period (e.g., missing 3 times continuously)
      const julesSessionsRef = collection(db, "users", currentUser.uid, "julesSessions");
      const localQuery = query(julesSessionsRef, where("dashboardId", "==", selectedDashboardId));
      const localSnap = await getDocs(localQuery);

      for (const dSnap of localSnap.docs) {
        const localId = dSnap.id;
        const localData = dSnap.data();
        if (localId.startsWith("jsess-") || localData.archived) continue;

        if (!remoteSessionIds.has(localId)) {
          const currentMissing = localData.missingCount || 0;
          const nextMissing = currentMissing + 1;
          const updates: any = { missingCount: nextMissing, updatedAt: new Date().toISOString() };
          if (nextMissing >= 3) {
            updates.archived = true;
            updates.status = "archived";
          }
          await updateDoc(doc(julesSessionsRef, localId), updates);

          try {
            await fetch(`/api/jules_sessions/${localId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates)
            });
          } catch (_) {}
        } else {
          if (localData.missingCount && localData.missingCount > 0) {
            await updateDoc(doc(julesSessionsRef, localId), { missingCount: 0, updatedAt: new Date().toISOString() });
            try {
              await fetch(`/api/jules_sessions/${localId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ missingCount: 0 })
              });
            } catch (_) {}
          }
        }
      }
      
      // 4. Create new ones or restore if they reappeared
      for (const rSess of remoteSessions) {
        const sessId = rSess.id;
        const q = query(julesSessionsRef, where("id", "==", sessId));
        const snap = await getDocs(q);
        
        if (snap.empty) {
          await setDoc(doc(julesSessionsRef, sessId), {
            id: sessId,
            dashboardId: selectedDashboardId,
            name: parseJulesTitle(rSess.title, `Agent Session ${sessId.substring(0, 6)}...`),
            status: rSess.state || 'UNKNOWN',
            creatorWebUrl: rSess.creatorWebUrl || "",
            createdAt: rSess.createTime || new Date().toISOString(),
            updatedAt: rSess.updateTime || new Date().toISOString(),
            missingCount: 0
          });
        } else {
          const existingData = snap.docs[0].data();
          const updates: any = {};
          
          if (existingData.archived) {
            updates.archived = false;
          }
          if (existingData.missingCount !== 0) {
            updates.missingCount = 0;
          }
          
          const newStatus = rSess.state || 'UNKNOWN';
          if (existingData.status !== newStatus) {
            updates.status = newStatus;
          }
 
          if (rSess.creatorWebUrl && rSess.creatorWebUrl !== existingData.creatorWebUrl) {
            updates.creatorWebUrl = rSess.creatorWebUrl;
          }
          
          if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date().toISOString();
            await updateDoc(doc(julesSessionsRef, sessId), updates);
          }
        }
      }
      setLastJulesSessionsSyncTime(new Date());
    } catch (e: any) {
      if (e instanceof Error && (e.message.includes("Failed to fetch") || e.message.includes("fetch failed") || e.name === "TypeError")) {
        console.warn("Jules sessions background sync was unable to fetch (server might be starting up or offline):", e.message);
      } else {
        console.error("Failed to sync jules sessions automatically", e);
      }
    }
  };

  // Automatically poll/sync Jules sessions periodically when selected dashboard changes or every 45s
  useEffect(() => {
    if (!currentUser || !selectedDashboardId) return;

    // Trigger immediate sync
    syncJulesSessions();

    // Set polling interval (45 seconds, matches github polling)
    const interval = setInterval(() => {
      syncJulesSessions();
    }, 45000);

    return () => clearInterval(interval);
  }, [currentUser, selectedDashboardId]);

  // Automatically poll/refresh activities of the currently selected active session
  useEffect(() => {
    if (!currentUser || !selectedSessionId || selectedSessionId.startsWith("jsess-")) return;

    const interval = setInterval(() => {
      setRefreshActivitiesTrigger(prev => prev + 1);
    }, 15000); // Poll every 15 seconds for hot updates

    return () => clearInterval(interval);
  }, [currentUser, selectedSessionId]);

  // Create new Jules session
  const handleCreateJulesSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionNameInput.trim()) return;

    if (currentUser) {
      try {
        const sessId = `jsess-${Date.now()}`;
        const docRef = doc(db, "users", currentUser.uid, "julesSessions", sessId);
        await setDoc(docRef, {
          id: sessId,
          dashboardId: selectedDashboardId,
          name: newSessionNameInput,
          status: "idle",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        setNewSessionNameInput("");
        setSelectedSessionId(sessId);
      } catch (err) {
        console.error("Firestore create Jules session failed:", err);
      }
      return;
    }

    try {
      const res = await fetch(`/api/dashboards/${selectedDashboardId}/jules_sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSessionNameInput })
      });
      if (res.ok) {
        const data = await res.json();
        setNewSessionNameInput("");
        // Reload list
        const r = await fetch(`/api/dashboards/${selectedDashboardId}/jules_sessions`);
        const list = await r.json();
        setJulesSessions(list);
        setSelectedSessionId(data.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getDecoratedPrompt = (prompt: string, mode: 'interactive' | 'review' | 'start') => {
    let header = "";
    if (mode === "interactive") {
      header = `[MODE: Interactive plan]
(Goal: Discuss/Clarify before writing code)

Before making any changes you will start a deep planning mode. You will interact with the me to fully understand my requirements. You should be thoughtful and think about what I am trying to achieve.

Your initial goals are:

Have absolute certainty of my expectations and goals before you start working on the plan
Even if you think you have clarity on the task, ask me to confirm your assumptions in the form of questions.
Remember, you are asking questions - not having me approve a plan. The plan approval comes AFTER you ask these questions.
Ask as many questions and take as many turns as you need. You should have zero doubt about the task at hand. Test and verify every assumption you have made.
You should only ask questions about the task and questions that clarify my desires. Questions that you can derive from the code like ("what file does this logic live in?") can be asked but are discouraged.
After I respond to your questions, you may have more new questions. Think about my answers and reflect on what other questions you might have. Do this as often as you need. Remember in this planning mode, it is your utmost responsibility to make sure the requirements are crystal clear.
Always communicate with me and ask me questions.
When you are absolutely certain that you fully understand the task, create a plan as described above.
Once the plan is created and approved, proceed with execution autonomously. Do not ask for confirmation or additional questions unless absolutely necessary. Trust your plan and execute it.

`;
    } else if (mode === "review") {
      header = "[MODE: Review]\n(Goal: Generate plan and wait for approval)\n\n";
    } else if (mode === "start") {
      header = "[MODE: Start]\n(Goal: Implement directly without waiting for approval)\n\n";
    }
    return header + prompt;
  };

  const handleGenerateTitle = async () => {
    const rawPrompt = newSessionPromptInput.trim();
    if (!rawPrompt) return;
    setIsGeneratingTitle(true);
    try {
      const tRes = await fetch("/api/generate_title", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ prompt: rawPrompt })
      });
      if (tRes.ok) {
         const tData = await tRes.json();
         if (tData.title) {
           setNewSessionNameInput(tData.title);
         }
      }
    } catch(e) { 
      console.error("Auto title err:", e); 
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  const handleRegenerateSessionTitle = async (sessId: string, currentTitle: string) => {
    if (!currentUser) return;
    setIsRegeneratingTitleId(sessId);
    try {
      const tRes = await fetch("/api/generate_title", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ prompt: currentTitle })
      });
      if (tRes.ok) {
         const tData = await tRes.json();
         if (tData.title) {
            const julesSessionsRef = collection(db, "users", currentUser.uid, "julesSessions");
            await updateDoc(doc(julesSessionsRef, sessId), { name: tData.title, isAppGeneratedTitle: true });
         }
      }
    } catch(e) {
      console.error("Regenerate title err:", e);
    } finally {
      setIsRegeneratingTitleId(null);
    }
  };

  const handleDirectSpawnSession = async (mode: 'interactive' | 'review' | 'start') => {
    const rawPrompt = newSessionPromptInput.trim();
    if (!rawPrompt) return;

    setIsSpawningSession(true);
    try {
      let finalTitle = newSessionNameInput.trim();
      const titleLine = finalTitle ? `Title: ${finalTitle}\n\n` : "";
      const decoratedPrompt = titleLine + getDecoratedPrompt(rawPrompt, mode);

      if (currentUser) {
        // Find repo context for the selected dashboard ID
        const repoBindRef = doc(db, "users", currentUser.uid, "repoBindings", selectedDashboardId);
        const repoSnap = await getDoc(repoBindRef);
        let owner = "";
        let repo = "";
        let workingBranch = "main";
        if (repoSnap.exists()) {
          owner = repoSnap.data().owner || "";
          repo = repoSnap.data().repo || "";
          workingBranch = repoSnap.data().workingBranch || "main";
        }

        // Call proxy to create a real session
        const julesRes = await fetch("/api/jules_proxy/v1alpha/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: decoratedPrompt,
            sourceContext: {
              source: owner && repo ? `sources/github/${owner}/${repo}` : undefined,
              githubRepoContext: {
                startingBranch: workingBranch
              }
            }
          })
        });

        if (!julesRes.ok) {
          const errText = await julesRes.text();
          throw new Error("Failed to create Jules session: " + errText);
        }

        const sessionData = await julesRes.json();
        const newId = sessionData.id || sessionData.name?.replace('sessions/', '');
        if (!newId) throw new Error("Did not receive a valid session ID from Jules API.");

        // Clean user-friendly title (truncate prompt or use title returned)
        let sessionTitle = finalTitle || parseJulesTitle(sessionData.title, `Agent Session ${newId.substring(0, 6)}...`);

        const isAppGeneratedTitle = !!finalTitle;

        // Create the new session in firestore
        const newSesRef = doc(db, "users", currentUser.uid, "julesSessions", newId);
        await setDoc(newSesRef, {
          id: newId,
          dashboardId: selectedDashboardId,
          name: sessionTitle,
          isAppGeneratedTitle,
          status: 'working',
          createdAt: sessionData.createTime || new Date().toISOString(),
          updatedAt: sessionData.updateTime || new Date().toISOString()
        });

        setNewSessionPromptInput("");
        setNewSessionNameInput("");
        setSelectedSessionId(newId);

      } else {
        // Fallback for offline/unauthenticated
        const fallbackTitle = finalTitle || (rawPrompt.length > 30 ? rawPrompt.substring(0, 27) + "..." : rawPrompt);
        const res = await fetch(`/api/dashboards/${selectedDashboardId}/jules_sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fallbackTitle })
        });
        if (res.ok) {
          const data = await res.json();
          // Send message
          const msgRes = await fetch(`/api/jules_sessions/${data.id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: decoratedPrompt })
          });

          setNewSessionPromptInput("");
          setNewSessionNameInput("");
          // Reload julesSessions list
          const r = await fetch(`/api/dashboards/${selectedDashboardId}/jules_sessions`);
          const list = await r.json();
          const filtered = (list || []).filter((s: any) => !s.id.startsWith("jsess-"));
          setJulesSessions(filtered);
          setSelectedSessionId(data.id);
        }
      }
    } catch (err: any) {
      console.error("Direct spawn error:", err);
      // Wait, we don't need to change anything else here
      alert(err.message || "Failed to spawn new assistant session.");
    } finally {
      setIsSpawningSession(false);
    }
  };

  const handleReloadJulesSessions = async () => {
    if (!selectedDashboardId) return;
    setIsRefreshingJulesSessions(true);
    try {
      if (currentUser) {
        await syncJulesSessions();
      } else {
        const r = await fetch(`/api/dashboards/${selectedDashboardId}/jules_sessions`);
        const list = await r.json();
        const filtered = (list || []).filter((s: any) => s && s.id && !s.id.startsWith("jsess-"));
        setJulesSessions(filtered);
        setLastJulesSessionsSyncTime(new Date());
      }
    } catch (e) {
      console.error("Manual sessions refresh failed:", e);
    } finally {
      setIsRefreshingJulesSessions(false);
    }
  };

  // Send message draft to Jules
  const handleSendJulesMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentDraft = draftMessages[selectedSessionId] || "";
    if (!selectedSessionId || !currentDraft.trim()) return;

    if (currentUser) {
      setIsSendingJulesMessage(true);
      try {
        let currentSessId = selectedSessionId;
        
        // Check if it's a locally spawned draft session
        if (currentSessId.startsWith("jsess-")) {
            const repoBindRef = doc(db, "users", currentUser.uid, "repoBindings", selectedDashboardId);
            const repoSnap = await getDoc(repoBindRef);
            let owner = "";
            let repo = "";
            let workingBranch = "main";
            if (repoSnap.exists()) {
                owner = repoSnap.data().owner || "";
                repo = repoSnap.data().repo || "";
                workingBranch = repoSnap.data().workingBranch || "main";
            }
            
            const julesRes = await fetch("/api/jules_proxy/v1alpha/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: currentDraft,
                    sourceContext: {
                        source: owner && repo ? `sources/github/${owner}/${repo}` : undefined,
                        githubRepoContext: {
                            startingBranch: workingBranch
                        }
                    }
                })
            });
            
            if (!julesRes.ok) {
                const errText = await julesRes.text();
                throw new Error("Failed to create Jules session: " + errText);
            }
            
            const sessionData = await julesRes.json();
            const newId = sessionData.id || sessionData.name?.replace('sessions/', '');
            if (!newId) throw new Error("Did not receive a valid session ID from Jules API.");
            
            const draftSession = julesSessions.find(s => s.id === currentSessId);
            const isAppGeneratedTitle = draftSession?.isAppGeneratedTitle || false;

            // Create the new session in firestore
            const newSesRef = doc(db, "users", currentUser.uid, "julesSessions", newId);
            await setDoc(newSesRef, {
                id: newId,
                dashboardId: selectedDashboardId,
                name: draftSession?.name || parseJulesTitle(sessionData.title, `Agent Session ${newId.substring(0, 6)}...`),
                isAppGeneratedTitle,
                status: 'working',
                createdAt: sessionData.createTime || new Date().toISOString(),
                updatedAt: sessionData.updateTime || new Date().toISOString()
            });
            
            // Delete old jsess- session
            await deleteDoc(doc(db, "users", currentUser.uid, "julesSessions", currentSessId));
            
            // Swap IDs
            currentSessId = newId;
            setSelectedSessionId(newId);
            setDraftMessages(prev => ({ ...prev, [selectedSessionId]: "", [newId]: "" }));
            
        } else {
            // Send message to existing connected session
            const cleanSessId = currentSessId.startsWith("sessions/") ? currentSessId : `sessions/${currentSessId}`;
            const res = await fetch(`/api/jules_proxy/v1alpha/${cleanSessId}:sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: currentDraft })
            });
            
            if (!res.ok) {
                const errText = await res.text();
                throw new Error("Failed to send message: " + errText);
            }
            setDraftMessages(prev => ({ ...prev, [selectedSessionId]: "", [currentSessId]: "" }));
        }

        // Add a timeline event locally to record this
        const evId = `ev-jules-sent-${Date.now()}`;
        await setDoc(doc(db, "users", currentUser.uid, "timelineEvents", evId), {
           id: evId,
           dashboardId: selectedDashboardId,
           source: "jules",
           kind: "jules_message_sent",
           severity: "success",
           requiresUserAction: false,
           title: "Jules Instruction Dispatched",
           body: `Command sent to agent: "${currentDraft.substring(0, 80)}..."`,
           createdAt: new Date().toISOString()
        });
        
      } catch (err: any) {
        console.error("Jules Send Error:", err);
        alert(err.message || "Failed to communicate with Jules API.");
      } finally {
        setIsSendingJulesMessage(false);
      }
      return;
    }

    // Mock fallback section for non-logged in users
    setIsSendingJulesMessage(true);
    try {
      const res = await fetch(`/api/jules_sessions/${selectedSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentDraft })
      });
      if (res.ok) {
        setDraftMessages(prev => ({ ...prev, [selectedSessionId]: "" }));
        const actRes = await fetch(`/api/jules_sessions/${selectedSessionId}/activities`);
        const list = await actRes.json();
        setJulesActivities(list);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSendingJulesMessage(false);
    }
  };

  // Approve Jules suggestion plan
  const handleApproveJulesPlan = async (sessId: string) => {
    if (currentUser) {
      try {
        // Just send standard message API call for approval
        const cleanSessId = sessId.startsWith("sessions/") ? sessId : `sessions/${sessId}`;
        const res = await fetch(`/api/jules_proxy/v1alpha/${cleanSessId}:sendMessage`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ prompt: "I approve this plan. Proceed." })
        });
        if (!res.ok) {
             const errText = await res.text();
             throw new Error("Failed to send approval: " + errText);
        }
        
        // Update local status optimistically
        const sesRef = doc(db, "users", currentUser.uid, "julesSessions", sessId);
        await updateDoc(sesRef, {
          status: "working",
          updatedAt: new Date().toISOString()
        });

      } catch (err: any) {
        console.error("Approve error", err);
        alert(err.message || "Failed to send approval");
      }
      return;
    }

    try {
      const res = await fetch(`/api/jules_sessions/${sessId}/approve`, { method: "POST" });
      if (res.ok) {
        const actRes = await fetch(`/api/jules_sessions/${sessId}/activities`);
        const list = await actRes.json();
        setJulesActivities(list);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Dismiss Actionable items from timeline (lowers action count badges!)
  const handleDismissTimelineEvent = async (evId: string) => {
    if (currentUser) {
      try {
        const docRef = doc(db, "users", currentUser.uid, "timelineEvents", evId);
        await updateDoc(docRef, {
          requiresUserAction: false
        });
      } catch (err) {
        console.error("Firestore dismiss timeline event failure:", err);
      }
      return;
    }

    try {
      const res = await fetch(`/api/dashboards/${selectedDashboardId}/timeline/${evId}/dismiss`, {
        method: "POST"
      });
      if (res.ok) {
        // Reload timeline
        const timRes = await fetch(`/api/dashboards/${selectedDashboardId}/timeline`);
        const finalTim = await timRes.json();
        setTimelineEvents(finalTim);
        // Reload dashboards metrics update
        fetchDashboards();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleJulesDebugRequest = async () => {
    setJulesDebugResponse("Sending request...");
    try {
      const headers: any = {
        "Content-Type": "application/json"
      };

      if (julesApiKeyInput) {
        headers["Authorization"] = `Bearer ${julesApiKeyInput}`;
      }

      const options: any = {
        method: julesDebugMethod,
        headers
      };
      
      if (julesDebugMethod !== "GET" && julesDebugMethod !== "HEAD" && julesDebugPayload) {
        options.body = julesDebugPayload;
      }
      
      const res = await fetch(julesDebugEndpoint, options);
      
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
         data = await res.json();
      } else {
         data = await res.text();
      }
      
      setJulesDebugResponse(`Status: ${res.status}\n\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`);
    } catch (e: any) {
      setJulesDebugResponse(`Error: ${e.message}\nNote: If this is a CORS error, the external endpoint might not allow browser requests.`);
    }
  };

  // Delete dashboard entirely (archive state)
  const handleArchiveDashboard = async () => {
    if (currentUser) {
      if (!confirm("Are you sure you want to archive this project dashboard?")) return;
      try {
        const docRef = doc(db, "users", currentUser.uid, "dashboards", selectedDashboardId);
        await updateDoc(docRef, {
          archived: true,
          updatedAt: new Date().toISOString()
        });
        setSelectedDashboardId("");
      } catch (err) {
        console.error("Firestore archive dashboard failure:", err);
      }
      return;
    }

    if (!confirm("Are you sure you want to archive this project dashboard?")) return;
    try {
      const res = await fetch(`/api/dashboards/${selectedDashboardId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setSelectedDashboardId("");
        fetchDashboards(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Identify selected dashboard settings
  const activeDashboard = dashboards.find(d => d.id === selectedDashboardId);

  // Get dynamic sorting timestamp based on latest timeline activity or dashboard update
  const getWorkspaceTimestamp = (dash: any) => {
    const t1 = dash.updatedAt ? new Date(dash.updatedAt).getTime() : 0;
    const t2 = dash.createdAt ? new Date(dash.createdAt).getTime() : 0;
    const dashboardEvents = timelineEvents.filter(ev => ev.dashboardId === dash.id);
    const t3 = dashboardEvents.length > 0 
      ? Math.max(...dashboardEvents.map(ev => ev.createdAt ? new Date(ev.createdAt).getTime() : 0)) 
      : 0;
    return Math.max(t1, t2, t3);
  };

  const sortedDashboards = [...dashboards].sort((a, b) => {
    return getWorkspaceTimestamp(b) - getWorkspaceTimestamp(a);
  });

  // Styling helper for indicator color maps
  const colorMap: Record<string, string> = {
    blue: "bg-blue-600 border-blue-500 hover:bg-blue-700",
    emerald: "bg-emerald-600 border-emerald-500 hover:bg-emerald-700",
    purple: "bg-purple-600 border-purple-500 hover:bg-purple-700",
    indigo: "bg-indigo-600 border-indigo-500 hover:bg-indigo-700",
    rose: "bg-rose-600 border-rose-500 hover:bg-rose-700",
    amber: "bg-amber-600 border-amber-500 hover:bg-amber-700"
  };

  const textColMap: Record<string, string> = {
    blue: "text-blue-400 border-blue-900/40 bg-blue-950/20",
    emerald: "text-emerald-400 border-emerald-900/40 bg-emerald-950/20",
    purple: "text-purple-400 border-purple-900/40 bg-purple-950/20",
    indigo: "text-indigo-400 border-indigo-900/40 bg-indigo-950/20",
    rose: "text-rose-400 border-rose-900/40 bg-rose-950/20",
    amber: "text-amber-400 border-amber-900/40 bg-amber-950/20"
  };

  // Render badge stats based on priorities: error > action_required > running > unread > idle
  const renderDashboardBadge = (stats: any) => {
    if (!stats) return null;
    const { errorCount, actionRequiredCount, runningCount, unreadCount } = stats;

    if (errorCount > 0) {
      return (
        <span className="flex items-center gap-1 bg-red-600 text-white font-black text-[10px] px-1.5 py-0.5 rounded-full shadow-md animate-pulse">
          ✕ {errorCount}
        </span>
      );
    }
    if (actionRequiredCount > 0) {
      return (
        <span className="flex items-center gap-1 bg-yellow-500 text-zinc-950 font-bold text-[10px] px-1.5 py-0.5 rounded">
          ⚠ {actionRequiredCount}
        </span>
      );
    }
    if (runningCount > 0) {
      return (
        <span className="flex items-center gap-1 bg-cyan-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded animate-bounce">
          … {runningCount}
        </span>
      );
    }
    if (unreadCount > 0) {
      return (
        <span className="flex items-center gap-1 bg-sky-500 text-zinc-950 font-bold text-[10px] px-1.5 py-0.5 rounded-full">
          ● {unreadCount}
        </span>
      );
    }
    return (
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 block"></span>
    );
  };

  // Source logo helper
  const renderEventIcon = (source: string, severity: string) => {
    switch (source) {
      case "github":
        return <Github className={`w-3.5 h-3.5 ${severity === "error" ? "text-red-400" : "text-zinc-300"}`} />;
      case "jules":
        return <Cpu className="w-3.5 h-3.5 text-cyan-400" />;
      case "chatgpt_link":
        return <FileText className="w-3.5 h-3.5 text-emerald-400" />;
      case "user":
        return <User className="w-3.5 h-3.5 text-violet-400" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const renderWorkspaceSelector = (isDesktop: boolean) => (
    <div className={`items-center gap-2 relative ${isDesktop ? "hidden md:flex flex-1 mx-2" : "flex w-full"}`} id={isDesktop ? "workspace-dropdown-container-desktop" : "workspace-dropdown-container-mobile"}>
      <div className={`relative inline-block text-left w-full max-w-full`}>
        <button
          type="button"
          onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
          className={`flex items-center justify-between w-full focus:outline-none gap-2.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border min-w-0 ${
            currentView === "dashboard" && activeDashboard
              ? `bg-zinc-900 shadow-md border-zinc-700/60 ${textColMap[activeDashboard.color || "blue"]}`
              : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 focus:border-zinc-700"
          }`}
          id={isDesktop ? "header-workspace-select-button-desktop" : "header-workspace-select-button-mobile"}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${currentView === "dashboard" && activeDashboard ? "bg-rose-500 shadow animate-pulse" : "bg-zinc-650"}`} />
            <div className="flex flex-col text-left min-w-0 flex-1 relative">
              <span className="truncate block font-extrabold text-zinc-100 text-[13px]">
                {currentView === "dashboard" && activeDashboard 
                  ? activeDashboard.name 
                  : "All Workspaces"}
              </span>
              {currentView === "dashboard" && activeDashboard && githubBinding && (
                <span className="text-[10px] text-zinc-400/80 font-mono font-medium truncate block leading-tight mt-0.5">
                  {githubBinding.repo}:{githubBinding.workingBranch || githubBinding.defaultBranch}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {currentView === "dashboard" && activeDashboard && activeDashboard.badgeStats && renderDashboardBadge(activeDashboard.badgeStats)}
            <ChevronDown className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${isWorkspaceDropdownOpen ? "rotate-180" : ""}`} />
          </div>
        </button>

        {isWorkspaceDropdownOpen && (
          <>
            {/* Backdrop overlay to click out of dropdown */}
            <div 
              className="fixed inset-0 z-40 cursor-default" 
              onClick={() => setIsWorkspaceDropdownOpen(false)} 
            />
            
            {/* Dropdown menu */}
            <div className={`absolute left-0 mt-1.5 origin-top-left rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/95 ring-1 ring-black/10 flex flex-col p-1.5 z-50 ${isDesktop ? "w-80 md:w-[480px] lg:w-[600px]" : "w-full md:w-[480px] lg:w-[600px]"}`}>
              <div className="px-2 py-1.5 border-b border-zinc-800/80 mb-1.5 flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 font-bold">Select Workspace (Newest Activity First)</span>
              </div>
              <div className="max-h-[50vh] md:max-h-96 overflow-y-auto no-scrollbar space-y-1">
                {sortedDashboards.map(dash => {
                  const isSelected = selectedDashboardId === dash.id && currentView === "dashboard";
                  const statusColor = textColMap[dash.color || "blue"];
                  const lastActive = getWorkspaceTimestamp(dash);
                  const binding = allRepoBindings.find(b => b.dashboardId === dash.id);
                  
                  return (
                    <button
                      key={dash.id}
                      onClick={() => {
                        setSelectedDashboardId(dash.id);
                        setCurrentView("dashboard");
                        setIsWorkspaceDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-xs hover:scale-[1.01] font-semibold select-none cursor-pointer transition text-left ${
                        isSelected
                          ? `bg-zinc-800/90 shadow-md ${statusColor}`
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      }`}
                    >
                      <div className="flex items-start gap-3 overflow-hidden flex-1">
                        <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${isSelected ? "bg-rose-500 shadow-sm" : "bg-zinc-650"}`} />
                        <div className="flex flex-col truncate flex-1 leading-tight gap-1">
                          <span className={`text-[13px] truncate ${isSelected ? "font-extrabold text-zinc-100" : "font-medium text-zinc-300"}`}>{dash.name}</span>
                          {binding && (
                            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono shrink-0">
                              <span className={`truncate flex items-center gap-1 ${isSelected ? "text-zinc-400" : "text-zinc-500"}`}>
                                <Github className="w-3 h-3 shrink-0" />
                                {binding.owner}/{binding.repo}
                              </span>
                              <span className="text-sky-450/90 truncate flex items-center gap-1 bg-sky-950/30 px-1 py-0.5 rounded-sm">
                                <GitBranch className="w-3 h-3 shrink-0" />
                                {binding.workingBranch || binding.defaultBranch}
                              </span>
                            </div>
                          )}
                          {lastActive > 0 && (
                            <span className="text-[9px] text-zinc-500/80 font-mono">
                              Last active: {new Date(lastActive).toLocaleDateString()} {new Date(lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {dash.badgeStats && renderDashboardBadge(dash.badgeStats)}
                      </div>
                    </button>
                  );
                })}
                
                {sortedDashboards.length === 0 && (
                  <div className="px-3 py-6 text-center text-zinc-500 text-sm italic py-4">
                    No active workspaces configured
                  </div>
                )}
              </div>
              {/* Spin New Workspace button at the bottom of the dropdown */}
              <div className="border-t border-zinc-800/80 mt-1 pt-1.5">
                <button
                  onClick={() => {
                    setIsOpenRepoModal(true);
                    fetchGithubRepos();
                    setIsWorkspaceDropdownOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold text-rose-400 bg-rose-950/20 hover:bg-rose-900/30 hover:text-rose-300 transition-colors text-center cursor-pointer border border-rose-950"
                >
                  <Plus className="w-5 h-5 shrink-0" />
                  <span>Create New Workspace</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100 selection:bg-zinc-800 selection:text-white" id="applet-viewport">      {/* Top compact Navigation Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-900 shadow-md shadow-zinc-950/70 h-14 select-none shrink-0 z-10" id="header-main">
        <div className="flex items-center gap-1.5 overflow-visible flex-1">
          {/* Navigation Links with Sticky Home button */}
          <button
            onClick={() => setCurrentView("home")}
            title="Portal Home (Host Container Live)"
            className={`relative p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 ${
              currentView === "home"
                ? "bg-zinc-800 text-rose-500 font-bold shadow-lg shadow-black/40 border border-zinc-750"
                : "bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-855/40"
            }`}
          >
            <Home className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-450 border border-zinc-900 animate-pulse" />
          </button>
          {renderWorkspaceSelector(true)}
        </div>

        {/* Header Right Corner: Interactive user profile button */}
        <div className="flex items-center gap-1.5 shrink-0 select-none">
          <button
            onClick={() => setIsGithubBillingModalOpen(true)}
            className="flex items-center justify-center p-1.5 rounded-xl bg-blue-950/40 text-blue-400 border border-blue-900/30 hover:bg-blue-905/60 transition-all cursor-pointer shadow-md"
            title="GitHub Billing & Usage Links"
          >
            <Github className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsCodexDialogOpen(true)}
            className="flex items-center justify-center p-1.5 rounded-xl bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 hover:bg-emerald-900/60 transition-all cursor-pointer shadow-md"
            title="OpenAI Codex Links"
          >
            <Code className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="flex items-center justify-center transition-all cursor-pointer rounded-full shrink-0"
            title={currentUser ? `Secure Profile: ${currentUser.email}` : "Guest Mode - Setup Credentials"}
            id="header-profile-button"
          >
            {currentUser ? (
              currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full border border-rose-500/30 hover:border-rose-500/60 transition-colors"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/30 hover:border-rose-500/60 flex items-center justify-center text-rose-450 text-xs font-black font-mono transition-colors">
                  {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : (currentUser.email ? currentUser.email.charAt(0).toUpperCase() : "U")}
                </div>
              )
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 hover:border-zinc-700 flex items-center justify-center text-zinc-400 transition-colors">
                <User className="w-4 h-4" />
              </div>
            )}
          </button>
        </div>
      </header>

      {/* Secondary Workspace Navigation Bar */}
      <div className="bg-zinc-950/80 border-b border-zinc-800/60 px-4 py-2 shrink-0 z-20 flex md:hidden items-center shadow-sm w-full relative" id="workspace-bar">
        {renderWorkspaceSelector(false)}
      </div>

      {/* Home Portal View (All integrated long page) */}
      {currentView === "home" && (
        <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full flex flex-col gap-8 animate-fadeIn" id="home-portal-view">
          
          {/* Header section of the Portal Home */}
          <div className="flex flex-col gap-2 border-b border-zinc-900 pb-5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-450 font-mono">
              Portal Overview Setup Center
            </span>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h1 className="text-xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
                <Home className="w-7 h-7 text-rose-500" />
                Unified Control Station
              </h1>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-widest">Active Globals</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-300">Bindings: <strong className="text-emerald-450">{allRepoBindings.length}</strong></span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-xs font-mono text-zinc-300">Sessions: <strong className="text-rose-450">{allJulesSessions.length}</strong></span>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
              Configure underlying API environments, manage multi-target workspaces, review deep verification diagnostics, and trigger continuous synchronization daemon runs from a single scrollable hub.
            </p>
          </div>

          {/* Section 2: Quick Start Info & Navigation Guide */}
          <div className="bg-zinc-900/40 rounded-3xl p-6 border border-zinc-850 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6" id="home-section-guide">
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-zinc-150 font-sans flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-400" />
                Welcome to Consolidated Control Station
              </h3>
              <p className="text-[11px] text-zinc-400 leading-relaxed max-w-xl font-sans">
                Manage your active multi-target workspaces, triggers, and diagnostic sweep controls from the persistent header dropdown.
                GitHub-related telemetry & billing gateways have been integrated into the <span className="text-blue-400 font-mono font-bold">GitHub Icon</span> located in the top-right header corner for quick access anytime.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsOpenRepoModal(true);
                  fetchGithubRepos();
                }}
                className="px-3.5 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-455 text-[10px] uppercase tracking-wider font-extrabold rounded-xl border border-rose-500/20 transition cursor-pointer"
              >
                + New Workspace
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("settings");
                  setCurrentView("dashboard");
                }}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[10px] uppercase tracking-wider font-extrabold rounded-xl border border-zinc-700 transition cursor-pointer"
              >
                Go to Settings
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Jules API Debug View */}
      {currentView === "jules-debug" && (
        <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full flex flex-col gap-8 animate-fadeIn" id="jules-debug-view">
          <div className="flex flex-col gap-2 border-b border-zinc-900 pb-5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-450 font-mono">
              Diagnostics Center
            </span>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h1 className="text-xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
                <Activity className="w-7 h-7 text-rose-500" />
                Jules API Console
              </h1>
              <button
                onClick={() => setCurrentView("home")}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-colors w-fit border border-zinc-700"
              >
                Back to Home
              </button>
            </div>
            <p className="text-xs text-zinc-400 max-w-2xl mt-2">
              Send ad-hoc payloads to Jules endpoints, test authentication, monitor mock real-time events, and inspect raw API responses without creating functional Dashboard items.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-850 shadow-xl flex flex-col gap-4">
              <h2 className="text-sm font-bold text-zinc-200 border-b border-zinc-800 pb-2">Execute Jules REST API Request</h2>
              
              {/* Quick Presets row */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 bg-zinc-950 rounded-xl border border-zinc-850">
                <span className="text-[9px] uppercase font-mono tracking-wider font-extrabold text-zinc-500 mr-1.5 pl-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setJulesDebugMethod("GET");
                    setJulesDebugEndpoint("/api/jules_proxy/v1alpha/sessions");
                    setJulesDebugPayload("");
                  }}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-850 text-[10px] text-cyan-400 font-bold font-mono rounded-lg border border-zinc-800 transition active:scale-95"
                >
                  List Sessions (GET)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJulesDebugMethod("POST");
                    setJulesDebugEndpoint("/api/jules_proxy/v1alpha/sessions");
                    setJulesDebugPayload(JSON.stringify({
                      prompt: "Identify and refactor deprecated packages in our build",
                      sourceContext: {
                        githubRepoContext: {
                          startingBranch: "main"
                        }
                      }
                    }, null, 2));
                  }}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-850 text-[10px] text-emerald-400 font-bold font-mono rounded-lg border border-zinc-800 transition active:scale-95"
                >
                  Create Session (POST)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJulesDebugMethod("POST");
                    setJulesDebugEndpoint("/api/jules_proxy/v1alpha/sessions/SESSION_ID_HERE:sendMessage");
                    setJulesDebugPayload(JSON.stringify({
                      prompt: "Can you make the app corgi themed?"
                    }, null, 2));
                  }}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-850 text-[10px] text-amber-400 font-bold font-mono rounded-lg border border-zinc-800 transition active:scale-95"
                >
                  Send Message (POST)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJulesDebugMethod("POST");
                    setJulesDebugEndpoint("/api/jules_debug/request");
                    setJulesDebugPayload(JSON.stringify({
                      input: "Ping Jules Cloud Service",
                      agent: "antigravity-preview-05-2026"
                    }, null, 2));
                  }}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-850 text-[10px] text-rose-450 font-bold font-mono rounded-lg border border-zinc-800 transition active:scale-95"
                >
                  SDK Agent Ping
                </button>
              </div>

              <div className="space-y-4">
                 <div>
                   <label className="text-xs text-zinc-400 block mb-1">Target Endpoint / URL</label>
                   <div className="flex gap-2">
                     <select 
                       className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg p-2 text-sm w-24 shrink-0"
                       value={julesDebugMethod}
                       onChange={(e) => setJulesDebugMethod(e.target.value)}
                     >
                       <option value="GET">GET</option>
                       <option value="POST">POST</option>
                       <option value="PUT">PUT</option>
                       <option value="DELETE">DELETE</option>
                     </select>
                     <input 
                       type="text"
                       className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg p-2 text-sm"
                       value={julesDebugEndpoint}
                       onChange={(e) => setJulesDebugEndpoint(e.target.value)}
                       placeholder="https://api.jules.app/v1/..."
                     />
                   </div>
                   <div className="mt-1 text-[10px] text-zinc-500">Endpoints starting with /api/jules_proxy/ are securely routed to the live Jules API (jules.googleapis.com) using your registered Jules API Key.</div>
                 </div>
                 <div>
                    <label className="text-xs text-zinc-400 block mb-1">Payload (JSON)</label>
                    <textarea 
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg p-3 text-xs font-mono h-32 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                      value={julesDebugPayload}
                      onChange={(e) => setJulesDebugPayload(e.target.value)}
                    />
                 </div>
                 <button 
                   onClick={handleJulesDebugRequest}
                   className="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl text-sm font-bold transition-colors"
                 >
                   Send Request
                 </button>
              </div>
            </div>

            <div className="bg-zinc-950 rounded-3xl p-6 border border-zinc-850 shadow-xl flex flex-col gap-4">
              <h2 className="text-sm font-bold text-zinc-200 border-b border-zinc-800 pb-2">Response Log</h2>
              <div className="flex-1 bg-black rounded-xl border border-zinc-900 p-4 font-mono text-[10px] text-emerald-500 overflow-y-auto whitespace-pre-wrap">
                <div className="text-zinc-600 mb-2">// Server Response Output</div>
                {julesDebugResponse}
              </div>
              <div className="flex justify-end gap-2">
                <CopyToClipboard 
                  text={julesDebugResponse} 
                  iconSize={12} 
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                />
                <button 
                  onClick={() => setJulesDebugResponse("Waiting for request...")}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  Clear Log
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Frame */}
      {currentView === "dashboard" && (
        <div className="flex flex-1 flex-col overflow-hidden" id="workspace-container">

          {/* Workspace Target Detail Page */}
          <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950 pt-0 p-4 md:pt-0 md:p-6" id="main-content">
          
          {activeDashboard ? (
            <div className="flex-1 flex flex-col overflow-hidden -mt-2">
              
              {/* SECTION NAVIGATION PREFERENCES BAR */}
              <div className="flex items-center justify-between mt-0 shrink-0" id="tabs-navigation">
                <div className="flex items-center gap-1 overflow-x-auto select-none no-scrollbar py-0.5">
                  {[
                    { id: "overview", label: "Overview", icon: LayoutDashboard },
                    { id: "github", label: "Github", icon: Github },
                    { id: "jules", label: "Jules", icon: Cpu },
                    { id: "settings", label: "Settings", icon: Settings }
                  ].map(tab => {
                    const TabIcon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id as any);
                          // Clear reads if switching page context
                          if (tab.id === "github") {
                            fetch(`/api/dashboards/${selectedDashboardId}/read`, { method: "POST" });
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                          activeTab === tab.id
                            ? tab.id === "github"
                              ? "bg-blue-900/40 text-blue-400 shadow-md shadow-zinc-950/20"
                              : tab.id === "jules"
                              ? "bg-purple-900/40 text-purple-400 shadow-md shadow-zinc-950/20"
                              : "bg-zinc-800 text-sky-400 shadow-md shadow-zinc-950/20"
                            : "bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
                        }`}
                        id={`sec-tab-${tab.id}`}
                      >
                        <TabIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => {
                    const targetName = `chatgpt_workspace_${selectedDashboardId}`;
                    if (chatGptLinks && chatGptLinks[0]) {
                      handleOpenLink(chatGptLinks[0], targetName);
                    } else {
                      window.open("https://chatgpt.com", targetName);
                    }
                  }}
                  className="p-2 bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 rounded-xl hover:bg-emerald-900/60 transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                  title={chatGptLinks && chatGptLinks[0] ? "Open Bound ChatGPT Conversation" : "Open ChatGPT"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-4 h-4">
                    <path d="M22.281 11.826a2.6 2.6 0 0 0-1.57-2.316 6.002 6.002 0 0 0-3.323-6.52c-.115-.05-.233-.087-.353-.112a2.601 2.601 0 0 0-4.708-.75A6.002 6.002 0 0 0 5.674 5.99a2.596 2.596 0 0 0-1.638 2.226 6.003 6.003 0 0 0 1.933 7.039 2.597 2.597 0 0 0 1.57 2.316 6.002 6.002 0 0 0 3.323 6.52c.115.05.233.087.353.112a2.601 2.601 0 0 0 4.708.75 6.002 6.002 0 0 0 6.653-3.863 2.596 2.596 0 0 0 1.638-2.226 6.003 6.003 0 0 0-1.933-7.038Zm-6.619 8.163c-.8.406-1.745.548-2.652.4.45-.632.744-1.378.847-2.164l.01-.22V11.23l4.58 2.645c.4.23.633.64.633 1.106v.77c0 1.258-1.02 2.278-2.278 2.278-.383 0-.756-.098-1.085-.285Zm-.516-15.694c.8-.406 1.838-.415 2.645-.022A4.275 4.275 0 0 0 16.35 6.27l-.17.15-4.58 2.645V3.775c0-.462.247-.887.643-1.116L12.98 2.21a2.279 2.279 0 0 1 2.166 2.085v.001Zm-9.155 4.887c-.006-.897.435-1.733 1.189-2.257l.135-.084 3.999 2.308v5.29L3.398 13.06c-.4-.23-.647-.654-.647-1.116v-.77a2.279 2.279 0 0 1 3.242-2.068Zm12.607.728-3.999-2.308V2.312c0-.056.004-.112.012-.167.48.73.684 1.64.558 2.541l-.037.195 4.58 2.645c.4.23.864.23 1.264 0l.667-.384a2.278 2.278 0 0 1-3.045 2.768Zm-.859 3.023L13.16 10.28l-2.023-1.168-2.023 1.168v2.336l2.023 1.168 2.023-1.168ZM4.697 15.682c.006.897-.435 1.733-1.189 2.257l-.135.084-3.999-2.308v-5.29l4.58-2.645c.4.23.647.654.647 1.116v.77a2.279 2.279 0 0 1-3.243 2.068Zm4.644-8.892L13.34 9.098v5.29l-4.58 2.645c-.4.23-.864.23-1.264 0l-.667-.384a2.278 2.278 0 0 1 3.045-2.768v-4.783c0-.858-.456-1.64-1.205-2.06Z" />
                  </svg>
                </button>
              </div>

              {/* CORE ACTIVE TAB VIEW CONTENT */}
              <div className="flex-1 overflow-y-auto mt-2.5" id="tab-window-content">
                
                {/* 1. OVERVIEW SCREEN */}
                {activeTab === "overview" && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-full align-top" id="overview-view">
                    
                    {/* 1. Open/Draft PRs */}
                    <div className="md:col-span-4 bg-blue-950/20 border border-blue-900/40 rounded-2xl p-4 shadow-lg shadow-black/25 flex flex-col gap-3">
                      <span className="text-[10px] tracking-wide uppercase text-blue-400 font-mono font-bold flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                        Open / Draft Pull Requests
                      </span>
                      <div className="space-y-2 overflow-y-auto max-h-[300px] no-scrollbar">
                        {githubPendingPRs
                          .filter(pr => pr.state === "open")
                          .slice(0, 5)
                          .map(pr => (
                            <a key={pr.id} href={pr.html_url} target="_blank" rel="noreferrer" className="block p-3 bg-zinc-950 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors">
                              <div className="text-xs font-bold text-zinc-200 mb-1.5 whitespace-normal break-words" title={pr.title}>{pr.title}</div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider shrink-0 ${pr.draft ? "bg-zinc-800 text-zinc-400" : "bg-sky-900 text-sky-200"}`}>{pr.draft ? "DRAFT" : "OPEN"}</span>
                                <span className="text-[9px] text-zinc-500 font-mono">#{pr.number} • updated {formatRelativeTime(pr.updated_at)}</span>
                              </div>
                            </a>
                          ))
                        }
                        {githubPendingPRs.filter(pr => pr.state === "open").length === 0 && (
                          <div className="text-center py-4 text-xs text-zinc-600 font-mono">No open PRs</div>
                        )}
                      </div>
                    </div>
 
                    {/* 2. Active Jules Sessions */}
                    <div className="md:col-span-4 bg-purple-950/20 border border-purple-900/40 rounded-2xl p-4 shadow-lg shadow-black/25 flex flex-col gap-3">
                      <span className="text-[10px] tracking-wide uppercase text-purple-400 font-mono font-bold flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-purple-400" />
                        Active Jules Sessions
                      </span>
                      <div className="space-y-2 overflow-y-auto max-h-[300px] no-scrollbar">
                        {julesSessions
                          .filter(s => !s.archived && s.status !== "archived")
                          .slice(0, 5)
                          .map(s => (
                            <button
                              key={s.id}
                              onClick={() => {
                                setSelectedSessionId(s.id);
                                setActiveTab("jules");
                              }}
                              className="w-full text-left p-3 bg-purple-950/40 rounded-xl border border-purple-900/40 hover:border-purple-800 hover:bg-purple-950/60 transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-500 block animate-fade-in"
                            >
                              <div className="text-xs font-bold text-zinc-200 mb-1.5 whitespace-normal break-words" title={s.name}>{s.name}</div>
                              <div>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider inline-block ${s.status === "running" ? "bg-purple-900 text-purple-100" : "bg-purple-950/80 text-purple-300 border border-purple-900/50"}`}>{s.status}</span>
                              </div>
                            </button>
                          ))
                        }
                        {julesSessions.filter(s => !s.archived && s.status !== "archived").length === 0 && (
                          <div className="text-center py-4 text-xs text-zinc-600 font-mono">No active sessions</div>
                        )}
                      </div>
                    </div>
 
                    {/* 3. Failed GitHub Workflows */}
                    <div className="md:col-span-4 bg-blue-950/20 border border-blue-900/40 rounded-2xl p-4 shadow-lg shadow-black/25 flex flex-col gap-3">
                      <span className="text-[10px] tracking-wide uppercase text-blue-400 font-mono font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-blue-400" />
                        Failed GitHub Workflows
                      </span>
                      <div className="space-y-2 overflow-y-auto max-h-[300px] no-scrollbar">
                        {timelineEvents
                          .filter(ev => ev.kind === "workflow_run_failed")
                          .slice(0, 5)
                          .map(ev => (
                            <a key={ev.id} href={ev.externalUrl || "#"} target="_blank" rel="noreferrer" className="block p-3 bg-red-950/10 rounded-xl border border-red-900/30 hover:border-red-900/50 transition-colors">
                              <div className="text-xs font-bold text-red-200 mb-1.5 whitespace-normal break-words" title={ev.title}>{ev.title}</div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider bg-red-900/40 text-red-300 border border-red-900/50 shrink-0">FAILED</span>
                                <span className="text-[9px] text-zinc-500 font-mono">{formatRelativeTime(ev.createdAt)}</span>
                              </div>
                            </a>
                          ))
                        }
                        {timelineEvents.filter(ev => ev.kind === "workflow_run_failed").length === 0 && (
                          <div className="text-center py-4 text-xs text-zinc-600 font-mono">No recent failures</div>
                        )}
                      </div>
                    </div>


                  </div>
                )}

                {/* 3. GITHUB STREAM MONITOR */}
                {activeTab === "github" && (
                  <div className="space-y-4" id="github-monitor-view">
                    
                    {/* Pending Pull Requests Section */}
                    {githubBinding && (
                      <div className="bg-blue-950/20 border border-blue-900/40 rounded-2xl p-4 md:p-5 shadow-xl shadow-black/35">
                        <div className="flex flex-col gap-2 mb-3 border-b border-blue-900/40 pb-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wider text-blue-400 font-mono font-bold flex items-center gap-2 flex-wrap">
                              <span>Active Pull Requests</span>
                              {lastGithubSyncTime && (
                                <span className="text-zinc-400 text-[9px] tracking-normal normal-case font-mono font-normal flex items-center gap-1">
                                  <span className="opacity-80">・同期:</span>
                                  <span className="font-semibold text-blue-400">{getAbsoluteTimeString(lastGithubSyncTime)}</span>
                                  <span className="text-[8px] bg-blue-950 px-1 py-0.2 rounded border border-blue-900/40 text-blue-400/95 font-medium">{getRelativeTimeString(lastGithubSyncTime)}</span>
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  forceRefreshPRs();
                                }}
                                disabled={isFetchingManualPRs}
                                className="bg-blue-600/20 hover:bg-blue-500/30 disabled:opacity-50 text-blue-400 text-[10px] uppercase tracking-wider font-bold rounded px-2 py-1 flex items-center gap-1 transition"
                              >
                                <RefreshCw className={`w-3 h-3 ${isFetchingManualPRs ? "animate-spin" : ""}`} />
                                強制再取得
                              </button>
                              <button
                                onClick={() => setShowRawGithubPRs(!showRawGithubPRs)}
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[9px] uppercase tracking-wider font-bold rounded px-2 py-1 flex items-center gap-1 transition"
                              >
                                {showRawGithubPRs ? "Hide Raw JSON" : "Show Raw JSON"}
                              </button>
                              <a
                                href={`https://github.com/${githubBinding.owner}/${githubBinding.repo}/pulls`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-blue-600/20 hover:bg-blue-500/30 text-blue-400 text-[10px] uppercase tracking-wider font-bold rounded px-2 py-1 flex items-center gap-1 transition"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View on GitHub
                              </a>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => setPrFilterOpen(!prFilterOpen)}
                              className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded transition ${prFilterOpen ? "text-green-400 bg-green-950/60 border border-green-500/30" : "text-zinc-500 bg-zinc-900 border border-transparent hover:text-zinc-400"}`}
                            >
                              Open ({githubPendingPRs.filter(pr => pr.state === "open" && !pr.draft).length})
                            </button>
                            <button
                              onClick={() => setPrFilterDraft(!prFilterDraft)}
                              className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded transition ${prFilterDraft ? "text-zinc-300 bg-zinc-800 border border-zinc-600/30" : "text-zinc-500 bg-zinc-900 border border-transparent hover:text-zinc-400"}`}
                            >
                              Draft ({githubPendingPRs.filter(pr => pr.draft).length})
                            </button>
                            <button
                              onClick={() => setPrFilterMerged(!prFilterMerged)}
                              className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded transition ${prFilterMerged ? "text-purple-400 bg-purple-950/60 border border-purple-500/30" : "text-zinc-500 bg-zinc-900 border border-transparent hover:text-zinc-400"}`}
                            >
                              Merged ({githubPendingPRs.filter(pr => !!pr.merged_at).length})
                            </button>
                          </div>
                        </div>
                        
                        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-0.5 no-scrollbar">
                          {showRawGithubPRs ? (
                            <pre className="text-[10px] text-zinc-300 font-mono bg-zinc-950 p-3 rounded-xl overflow-x-auto">
                              {JSON.stringify(githubPendingPRs, null, 2)}
                            </pre>
                          ) : githubPendingPRs.length > 0 ? (
                            githubPendingPRs.filter(pr => {
                              const isMerged = !!pr.merged_at;
                              const isClosed = pr.state === "closed" && !isMerged;
                              const isDraft = pr.draft;
                              const isOpen = pr.state === "open" && !isDraft;

                              if (isMerged && prFilterMerged) return true;
                              if (isDraft && prFilterDraft) return true;
                              if (isOpen && prFilterOpen) return true;
                              // By default, hide closed ones that are not merged unless another filter is active. For now, just these 3 toggles.
                              
                              return false;
                            }).map(pr => {
                              let statusText = "Open";
                              let statusColor = "text-green-400 bg-green-950/40";
                              if (pr.merged_at) {
                                statusText = "Merged";
                                statusColor = "text-purple-400 bg-purple-950/40";
                              } else if (pr.state === "closed") {
                                statusText = "Closed";
                                statusColor = "text-red-400 bg-red-950/40";
                              } else if (pr.draft) {
                                statusText = "Draft";
                                statusColor = "text-zinc-400 bg-zinc-800";
                              }

                              return (
                                <div key={pr.id || "debug-pr"} className="p-3 bg-zinc-950 rounded-xl flex items-center justify-between shadow-sm border border-transparent hover:border-blue-900/30 transition">
                                  <div className="flex flex-col gap-1 overflow-hidden pr-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-zinc-400 font-mono text-xs">#{pr.number || "???"}</span>
                                      <a href={pr.html_url} target="_blank" rel="noreferrer" className="text-zinc-100 font-bold text-xs truncate max-w-[200px] md:max-w-xs hover:text-blue-400 hover:underline">
                                        {pr.title}
                                      </a>
                                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${statusColor}`}>
                                        {statusText}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-2">
                                      <span>{pr.user?.login}</span>
                                      <span>•</span>
                                      <span>{pr.head?.ref} ➔ {pr.base?.ref}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          ) : isFetchingManualPRs && githubPendingPRs.length === 0 ? (
                            <div className="p-4 text-center text-blue-400 text-xs flex justify-center items-center gap-2">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin"/> Loading Pull Requests...
                            </div>
                          ) : githubPendingPRsError ? (
                            <div className="p-4 text-center text-red-500 text-xs">
                              Error fetching PRs: {githubPendingPRsError}
                            </div>
                          ) : (
                            <div className="p-4 text-center text-zinc-500 text-xs">
                              No matching PRs found.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Filtered GitHub specific events log stream */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Branch Streams Panel */}
                      <div className="bg-blue-950/20 border border-blue-900/40 rounded-2xl p-4 md:p-5 shadow-xl shadow-black/35 flex flex-col h-[500px]">
                        <div className="border-b border-blue-900/40 pb-2.5 mb-3 flex justify-between items-center flex-wrap gap-2 shrink-0">
                          <span className="text-[10px] uppercase tracking-wider text-blue-400 font-mono font-bold flex items-center gap-2 flex-wrap">
                            <span>Branch Streams</span>
                            {lastGithubSyncTime && (
                              <span className="text-zinc-400 text-[9px] tracking-normal normal-case font-mono font-normal flex items-center gap-1">
                                <span className="opacity-80">・同期:</span>
                                <span className="font-semibold text-blue-400">{getAbsoluteTimeString(lastGithubSyncTime)}</span>
                                <span className="text-[8px] bg-blue-950 px-1 py-0.2 rounded border border-blue-900/40 text-blue-400/95 font-medium">{getRelativeTimeString(lastGithubSyncTime)}</span>
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="space-y-2 overflow-y-auto pr-0.5 no-scrollbar flex-1">
                          {timelineEvents.filter(e => e.source === "github" && !["workflow_run_started", "workflow_run_completed", "check_run_succeeded", "check_run_failed", "commit_status_succeeded", "commit_status_failed"].includes(e.kind)).map(ev => (
                            <div key={ev.id} className="p-3 bg-zinc-950 rounded-xl flex items-start gap-3 justify-between hover:bg-zinc-900 transition shadow-sm group">
                              <div className="flex items-start gap-2.5 max-w-full overflow-hidden">
                                <span className="pt-0.5 shrink-0">{renderEventIcon("github", ev.severity)}</span>
                                <div>
                                  <span className="text-xs font-bold text-zinc-200 group-hover:text-white transition-colors">{ev.title}</span>
                                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{ev.body}</p>
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <span className="text-[9px] text-zinc-500 font-mono">
                                  {new Date(ev.createdAt).toLocaleTimeString()}
                                </span>
                                  <CopyToClipboard 
                                    text={ev.body || ""} 
                                    showText={false} 
                                    iconSize={12} 
                                    className="p-1 hover:bg-zinc-800 rounded-lg"
                                  />
                                  {ev.externalUrl && (
                                  <button
                                    onClick={() => window.open(ev.externalUrl, "_blank")}
                                    className="p-1 hover:bg-zinc-800 rounded-lg text-sky-450 hover:text-white cursor-pointer"
                                    title="Open in GitHub browser portal"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                          {timelineEvents.filter(e => e.source === "github" && !["workflow_run_started", "workflow_run_completed", "check_run_succeeded", "check_run_failed", "commit_status_succeeded", "commit_status_failed"].includes(e.kind)).length === 0 && (
                            <div className="p-4 text-center text-zinc-500 text-xs">
                              No Branch Stream telemetry markers recorded. Double check your secure PAT access tokens!
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Workflow Statuses Panel */}
                      <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-2xl p-4 md:p-5 shadow-xl shadow-black/35 flex flex-col h-[500px]">
                        <div className="border-b border-emerald-900/40 pb-2.5 mb-3 flex justify-between items-center flex-wrap gap-2 shrink-0">
                          <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-mono font-bold flex items-center gap-2 flex-wrap">
                            <span>Workflow Statuses</span>
                            {lastGithubSyncTime && (
                              <span className="text-zinc-400 text-[9px] tracking-normal normal-case font-mono font-normal flex items-center gap-1">
                                <span className="opacity-80">・同期:</span>
                                <span className="font-semibold text-emerald-400">{getAbsoluteTimeString(lastGithubSyncTime)}</span>
                                <span className="text-[8px] bg-emerald-950 px-1 py-0.2 rounded border border-emerald-900/40 text-emerald-400/95 font-medium">{getRelativeTimeString(lastGithubSyncTime)}</span>
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="space-y-2 overflow-y-auto pr-0.5 no-scrollbar flex-1">
                          {timelineEvents.filter(e => e.source === "github" && ["workflow_run_started", "workflow_run_completed", "check_run_succeeded", "check_run_failed", "commit_status_succeeded", "commit_status_failed"].includes(e.kind)).map(ev => (
                            <div key={ev.id} className="p-3 bg-zinc-950 rounded-xl flex items-start gap-3 justify-between hover:bg-zinc-900 transition shadow-sm group">
                              <div className="flex items-start gap-2.5 max-w-full overflow-hidden">
                                <span className="pt-0.5 shrink-0">{renderEventIcon("github", ev.severity)}</span>
                                <div>
                                  <a href={ev.externalUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-zinc-200 group-hover:text-white transition-colors hover:text-blue-400 hover:underline">
                                    {ev.title}
                                  </a>
                                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{ev.body}</p>
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <span className="text-[9px] text-zinc-500 font-mono">
                                  {new Date(ev.createdAt).toLocaleTimeString()}
                                </span>
                                  <CopyToClipboard 
                                    text={ev.body || ""} 
                                    showText={false} 
                                    iconSize={12} 
                                    className="p-1 hover:bg-zinc-800 rounded-lg"
                                  />
                              </div>
                            </div>
                          ))}

                          {timelineEvents.filter(e => e.source === "github" && ["workflow_run_started", "workflow_run_completed", "check_run_succeeded", "check_run_failed", "commit_status_succeeded", "commit_status_failed"].includes(e.kind)).length === 0 && (
                            <div className="p-4 text-center text-zinc-500 text-xs">
                              No Workflow Status markers recorded.
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-span-1 md:col-span-2 text-right mt-1">
                        <span className="text-[9px] text-zinc-500 font-mono">polling loop configured (45s)</span>
                      </div>
                    </div>

                  </div>
                )}

                {/* 4. JULES AGENT INTERACTIVE CONSOLE */}
                {activeTab === "jules" && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-full min-h-[350px]" id="jules-view">
                    
                    {/* Session controller left sidebar */}
                    <div className="md:col-span-4 flex flex-col gap-4">
                      
                      {/* JULES SESSIONS LIST PANEL */}
                      <div className="bg-purple-950/20 border border-purple-900/40 rounded-2xl p-4 shadow-xl shadow-black/35 flex flex-col gap-3">
                        <div className="border-b border-purple-900/40 pb-2 flex justify-between items-center flex-wrap gap-2">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-purple-400 font-bold flex items-center gap-2 flex-wrap">
                            <span>Jules Sessions</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleReloadJulesSessions}
                              disabled={isRefreshingJulesSessions}
                              className="p-1 rounded text-zinc-400 hover:text-purple-400 hover:bg-zinc-800/60 disabled:opacity-50 transition cursor-pointer"
                              title="Manual reload sessions list"
                            >
                              <RefreshCw className={`w-3 h-3 ${isRefreshingJulesSessions ? "animate-spin" : ""}`} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5 flex flex-col max-h-[300px] overflow-y-auto pr-0.5 no-scrollbar">
                          {(() => {
                            const filteredSessions = julesSessions.filter(sess =>
                              showArchivedJulesSessions ||
                              sess.id === selectedSessionId ||
                              !(sess.archived || sess.status === "archived")
                            );
                            
                            return (
                              <>
                                {filteredSessions.map(sess => {
                                  const isSelected = sess.id === selectedSessionId;
                                  const isArchived = sess.archived || sess.status === "archived";
                                  return (
                                    <div
                                      key={sess.id}
                                      className={`w-full p-2.5 rounded-xl flex items-center justify-between transition shadow-sm ${
                                        isSelected
                                          ? "bg-purple-950/40 text-purple-400 font-extrabold border border-purple-900/30"
                                          : "bg-zinc-950 text-zinc-400 hover:bg-zinc-850/60 border border-transparent"
                                      }`}
                                    >
                                      <button
                                        onClick={() => setSelectedSessionId(sess.id)}
                                        className="flex-1 text-left truncate mr-1 cursor-pointer focus:outline-none flex flex-col"
                                        id={`jules-sess-${sess.id}`}
                                      >
                                        <span className="text-xs truncate w-full">{sess.name}</span>
                                        {sess.updatedAt && (
                                          <span className="text-[9px] text-zinc-500">
                                            {formatRelativeTime(sess.updatedAt)}
                                          </span>
                                        )}
                                      </button>
                                      
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={`text-[8px] font-mono px-2 py-0.5 rounded-md ${
                                          isArchived
                                            ? "bg-zinc-800 text-zinc-500 border border-zinc-700/60 font-bold"
                                            : sess.status === "waiting_for_approval" 
                                            ? "bg-yellow-500 text-zinc-950 font-extrabold shadow-sm"
                                            : (sess.status === "IN_PROGRESS" || sess.status === "ACTIVE" || sess.status === "working")
                                            ? "bg-emerald-500 text-zinc-950 font-extrabold shadow-sm animate-pulse"
                                            : sess.id.startsWith("jsess-")
                                            ? "bg-zinc-700 text-zinc-300"
                                            : "bg-zinc-800 text-zinc-400"
                                        }`}>
                                          {isArchived ? "archived" : (sess.id.startsWith("jsess-") ? "draft" : sess.status)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}

                                {filteredSessions.length === 0 && (
                                  <div className="p-4 text-purple-500/80 text-xs text-center font-mono">
                                    {julesSessions.length > 0 ? "No active sessions. (Archived sessions are hidden)" : "No sessions active."}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* INDEPENDENT CARD FOR SPAWNING JULES SESSION */}
                      <div className="bg-purple-950/20 border border-purple-900/40 rounded-2xl p-4 shadow-xl shadow-black/35 flex flex-col gap-2.5">
                        <span className="text-[10px] uppercase text-purple-300 font-bold font-mono flex items-center gap-1.5 mb-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                          Begin New Jules Session
                        </span>

                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Session Title (Optional)"
                            value={newSessionNameInput}
                            onChange={e => setNewSessionNameInput(e.target.value)}
                            className="w-full bg-zinc-950/70 border border-purple-900/40 py-2 px-3 text-xs rounded-xl text-white focus:outline-none focus:border-purple-500 font-sans shadow-inner placeholder-zinc-500 pr-10"
                            disabled={isSpawningSession || isGeneratingTitle}
                          />
                          <button
                            type="button"
                            onClick={handleGenerateTitle}
                            disabled={isSpawningSession || isGeneratingTitle || !newSessionPromptInput.trim()}
                            className="absolute right-1 top-1 p-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-900/50 rounded-lg transition-colors disabled:opacity-50"
                            title="Auto-generate title from prompt"
                          >
                            {isGeneratingTitle ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        
                        <textarea
                          placeholder="Describe your task guidelines... (e.g., build responsive layout, write test assertions)"
                          value={newSessionPromptInput}
                          onChange={e => setNewSessionPromptInput(e.target.value)}
                          className="w-full bg-zinc-950 border border-purple-900/30 py-2.5 px-3 text-xs rounded-xl text-white focus:outline-none focus:border-purple-500 font-sans shadow-inner resize-y min-h-[60px] max-h-[220px]"
                          rows={3}
                          disabled={isSpawningSession || isGeneratingTitle}
                        />

                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            onClick={() => handleDirectSpawnSession('interactive')}
                            disabled={isSpawningSession || !newSessionPromptInput.trim() || !newSessionNameInput.trim()}
                            title={!newSessionNameInput.trim() ? "Please enter a session title to begin" : "Interactive plan: Chat & clarify goals before planning"}
                            className="flex flex-col items-center justify-center gap-1.5 p-2 bg-purple-950/40 hover:bg-purple-900/40 border border-purple-800/35 font-bold rounded-xl text-[9px] text-purple-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transform active:scale-95 shadow-sm"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                            <span>Interactive</span>
                          </button>

                          <button
                            onClick={() => handleDirectSpawnSession('review')}
                            disabled={isSpawningSession || !newSessionPromptInput.trim() || !newSessionNameInput.trim()}
                            title={!newSessionNameInput.trim() ? "Please enter a session title to begin" : "Review: Generate plan and wait for manual approval"}
                            className="flex flex-col items-center justify-center gap-1.5 p-2 bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-800/35 font-bold rounded-xl text-[9px] text-cyan-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transform active:scale-95 shadow-sm"
                          >
                            <Eye className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Review</span>
                          </button>

                          <button
                            onClick={() => handleDirectSpawnSession('start')}
                            disabled={isSpawningSession || !newSessionPromptInput.trim() || !newSessionNameInput.trim()}
                            title={!newSessionNameInput.trim() ? "Please enter a session title to begin" : "Start: Get started immediately without manual approval"}
                            className="flex flex-col items-center justify-center gap-1.5 p-2 bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-800/35 font-bold rounded-xl text-[9px] text-emerald-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transform active:scale-95 shadow-sm"
                          >
                            <Play className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Start</span>
                          </button>
                        </div>
                        {isSpawningSession && (
                          <div className="text-[9px] text-purple-400 font-mono text-center animate-pulse flex items-center justify-center gap-1.5 mt-1 border border-purple-955/20 bg-purple-955/5 p-2 rounded-lg">
                            <RefreshCw className="w-3 h-3 animate-spin text-purple-400" />
                            Powering up a new Jules Agent Workspace...
                          </div>
                        )}
                      </div>

                    </div>

                    {/* Active Conversation Chat Box Frame */}
                    <div className="md:col-span-8 flex flex-col bg-purple-950/20 border border-purple-900/40 rounded-2xl p-4 shadow-xl shadow-black/35 min-h-[300px]">
                      
                      <div className="border-b border-purple-900/40 pb-2 mb-3 flex items-center justify-between">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-purple-400 font-bold">Session Conversation</span>
                          {selectedSessionId && (
                            <>
                              <span className="text-zinc-650 font-mono text-[9px] mx-1">/</span>
                              <span 
                                className="text-xs font-semibold text-zinc-300 leading-snug cursor-pointer hover:underline hover:text-purple-300"
                                onClick={() => {
                                  if (selectedSessionId) {
                                    const targetName = `jules_workspace_${selectedDashboardId}`;
                                    const sessionObj = julesSessions.find(s => s.id === selectedSessionId);
                                    const url = sessionObj?.creatorWebUrl || `https://jules.google.com/task/${selectedSessionId}`;
                                    window.open(url, targetName);
                                  }
                                }}
                                title={(() => {
                                  if (!selectedSessionId) return undefined;
                                  const sessionObj = julesSessions.find(s => s.id === selectedSessionId);
                                  return sessionObj?.creatorWebUrl || `https://jules.google.com/task/${selectedSessionId}`;
                                })()}
                              >
                                {julesSessions.find(s => s.id === selectedSessionId)?.name || "Select/Spawn session"}
                              </span>
                              <button
                                onClick={() => handleRegenerateSessionTitle(selectedSessionId, julesSessions.find(s => s.id === selectedSessionId)?.name || "")}
                                disabled={isRegeneratingTitleId === selectedSessionId}
                                className="p-1 text-purple-500 hover:text-purple-300 hover:bg-purple-900/40 rounded transition-colors"
                                title="Regenerate Title"
                              >
                                {isRegeneratingTitleId === selectedSessionId ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3" />
                                )}
                              </button>

                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 font-mono">
                            {selectedSessionId?.startsWith("jsess-") ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shadow-sm shadow-zinc-600/50"></span>
                                <span className="text-zinc-500">Draft (Locally Spawned)</span>
                              </>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shadow-sm shadow-purple-400/50"></span>
                                <div className="flex flex-col">
                                  {lastSyncTime && (
                                    <div className="text-[8px] text-zinc-500 bg-zinc-900 border border-zinc-800/60 rounded px-1.5 py-0.5 flex flex-col gap-0.5">
                                      <div>
                                        同期: <span className="text-purple-400 font-medium font-mono">{getAbsoluteTimeString(lastSyncTime)}</span>
                                      </div>
                                      <div className="text-[7.5px] text-zinc-400 font-mono font-normal text-right">
                                        ({getRelativeTimeString(lastSyncTime)})
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          {selectedSessionId && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setIsRawResponseOpen(true)}
                                className="p-1.5 rounded-md transition-colors cursor-pointer text-zinc-400 hover:text-purple-400 hover:bg-purple-950/45"
                                title="View Raw Jules API Response (JSON)"
                                type="button"
                              >
                                <Code className="w-3.5 h-3.5 text-purple-400" />
                              </button>
                              <button
                                onClick={handleRefreshActivities}
                                disabled={isLoadingActivities}
                                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                                  isLoadingActivities 
                                    ? "text-cyan-400 bg-zinc-850 cursor-not-allowed" 
                                    : "text-zinc-400 hover:text-cyan-400 hover:bg-zinc-850"
                                }`}
                                title={isLoadingActivities ? "Synchronizing state..." : "Fetch Session Latest State"}
                                type="button"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingActivities ? "animate-spin" : ""}`} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dispatched plans approve or send messages */}
                      {selectedSessionId ? (
                        <div className="flex flex-col gap-2 transition-all mb-4">
                          {julesSessions.find(s => s.id === selectedSessionId)?.status === "waiting_for_approval" && (
                            <div className="bg-yellow-950/15 p-3 rounded-xl mb-1.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 shadow-sm">
                              <div className="text-[11px] text-yellow-550 leading-relaxed">
                                <strong>Approvals Pending:</strong> Click save work to proceed compiling the branch patch safely on server environment.
                              </div>
                              <button
                                onClick={() => handleApproveJulesPlan(selectedSessionId)}
                                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-450 text-zinc-950 font-black text-xs uppercase rounded-xl shadow-md transform active:scale-95 transition-all shrink-0 cursor-pointer"
                              >
                                Approve & Commit Branch Patches
                              </button>
                            </div>
                          )}

                          <form onSubmit={handleSendJulesMessage} className="flex gap-1.5 items-end">
                            <textarea
                              value={draftMessages[selectedSessionId] || ""}
                              onChange={e => {
                                const val = e.target.value;
                                setDraftMessages(prev => ({ ...prev, [selectedSessionId]: val }));
                              }}
                              onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  if (!isSendingJulesMessage && (draftMessages[selectedSessionId] || "").trim()) {
                                    handleSendJulesMessage(e as unknown as React.FormEvent);
                                  }
                                }
                              }}
                              placeholder="Command assistant (e.g. refactor react chat)&#10;Shift + Enter for new line"
                              className="flex-1 bg-zinc-950 border border-zinc-800 text-xs py-2 px-4 rounded-xl text-zinc-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 shadow-inner block resize-y max-h-[300px]"
                              rows={Math.min(10, Math.max(2, (draftMessages[selectedSessionId] || "").split("\n").length))}
                              id="jules-directive-field"
                            />
                            <button
                              type="submit"
                              disabled={isSendingJulesMessage || !(draftMessages[selectedSessionId] || "").trim()}
                              className="px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white flex font-black uppercase font-mono tracking-widest text-[11px] items-center gap-1.5 h-[40px] rounded-xl transition-all cursor-pointer shadow-md shadow-purple-900/20 shrink-0"
                            >
                              <Send className="w-3.5 h-3.5 text-white" />
                              Send
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div className="p-4 border border-dashed border-zinc-800 text-zinc-500 text-center text-xs rounded-xl font-mono mb-4">
                          No active Jules container sessions. Please choose or spawn a code assistant target sequence.
                        </div>
                      )}

                      {/* Deactivated custom filtering representation */}
                      {false && (() => {
                           const lastUserIndex = julesActivities.map(a => a.type).lastIndexOf("user_message");
                           const lastAgentIndex = julesActivities.map(a => a.type).lastIndexOf("agent_message");
                           
                           const lastUserActivity = lastUserIndex !== -1 ? julesActivities[lastUserIndex] : null;
                           const lastAgentActivity = lastAgentIndex !== -1 ? julesActivities[lastAgentIndex] : null;
                           
                           const displayActivities = [lastUserActivity, lastAgentActivity].filter(a => a !== null) as any[];
                           displayActivities.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                           if (displayActivities.length === 0) return null;

                           return (
                             <div className="mb-3 space-y-2">
                               <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest px-1">Jules Answers & User Prompts</div>
                               <div className="bg-emerald-950/20 border border-emerald-900/30 p-2.5 rounded-xl space-y-2 shadow-inner">
                                {displayActivities.map((act) => (
                                  <div key={`highlight-${act.id}`} className={`p-2.5 rounded-xl text-[11px] leading-relaxed max-w-[95%] shadow-sm ${
                                    act.type === "user_message"
                                      ? "bg-zinc-800 ml-auto text-zinc-100 border border-zinc-700"
                                      : "bg-purple-900/40 text-purple-200 border border-purple-800/50"
                                  }`}>
                                    <div className="flex justify-between items-center text-[9px] text-zinc-400 mb-1.5 font-mono uppercase">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold tracking-wider">{act.type === "user_message" ? "PROMPT" : "Agent Answer"}</span>
                                        {act.type !== "system_log" && (
                                          <CopyToClipboard text={act.text || ""} showText={false} iconSize={10} className="p-0.5" />
                                        )}
                                      </div>
                                      <span>{act.createdAt ? formatRelativeTime(act.createdAt, false) : ""}</span>
                                    </div>
                                    <CollapsibleMessageText text={act.text} />
                                    {act.url && (
                                      <div className="mt-2 text-right">
                                        <a 
                                          href={act.url} 
                                          target="_blank" 
                                          rel="noopener noreferrer" 
                                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/40 text-purple-200 border border-purple-500/50 rounded-md text-[8px] font-bold uppercase tracking-wider transition-colors"
                                        >
                                          {act.type === 'pull_request' ? "🔗 Show PR" : "📁 Browse branch"}
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                ))}
                               </div>
                             </div>
                           );
                      })()}

                      {/* Full Msg Stream */}
                      <div className="flex-1 overflow-y-auto space-y-2.5 mb-3 p-3 bg-zinc-950 border border-purple-900/20 rounded-xl pr-1.5 no-scrollbar shadow-inner">
                        {julesActivitiesError && (
                          <div className="bg-[#2a1315]/90 border border-red-900/40 rounded-xl p-3.5 text-rose-300 relative text-left">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[12px] shrink-0">⚠️</span>
                              <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-rose-400">Jules API Sync Warning</span>
                            </div>
                            <p className="text-[11px] leading-relaxed mb-2.5 antialiased text-zinc-300">
                              {julesActivitiesError}
                            </p>
                            <div className="text-[10px] text-zinc-400 leading-normal space-y-1 mb-3">
                              <div>• <strong>API 503 / 504 / 429:</strong> REST API Proxy への通信、またはページデータ取得中に問題が発生しました。</div>
                              <div>• <strong>自動回復:</strong> 今回のエラーに対し、自動フォールバックが機能し、それまでに取得できた内容の他に、整合性維持のためローカルのキャッシュ履歴（Firestoreキャッシュ）を表示しています。</div>
                            </div>
                            <button
                              onClick={() => {
                                setJulesActivitiesError(null);
                                setRefreshActivitiesTrigger(prev => prev + 1);
                              }}
                              className="px-2.5 py-1.5 bg-red-950/40 hover:bg-rose-900/20 text-rose-200 text-[9.5px] font-mono border border-rose-800/40 rounded-lg cursor-pointer transition uppercase font-bold"
                            >
                              🔄 FORCE RELOAD ACTIVITIES
                            </button>
                          </div>
                        )}

                        {julesActivitiesNextPageToken && !julesActivitiesLoading && (
                          <button onClick={loadMoreActivities} className="w-full text-center text-[10px] py-1 text-purple-400 hover:text-purple-300 font-mono italic">
                            [ Load Older Messages ]
                          </button>
                        )}
                        {julesActivitiesLoading && (
                          <div className="w-full text-center text-[10px] py-1 text-zinc-500 font-mono italic">
                            [ Loading... ]
                          </div>
                        )}
                        {[...julesActivities]
                           .reverse()
                           .map(act => {
                             const isSysLog = act.type === "system_log";
                             const isExpanded = !!expandedSystemLogs[act.id];
                             
                             return (
                               <div 
                                 key={act.id} 
                                 className={`p-3 rounded-2xl text-[11px] leading-relaxed shadow-sm relative transition-all duration-200 ${
                                   act.type === "user_message"
                                     ? "bg-zinc-800 mr-auto ml-0 text-zinc-100 text-left max-w-[85%]"
                                     : isSysLog
                                     ? "bg-zinc-900/40 mx-auto text-zinc-500 font-mono text-[9px] border border-zinc-800/40 text-left w-full"
                                     : "bg-purple-950/20 text-purple-300 max-w-[85%]"
                                 }`} 
                                 id={`activity-log-${act.id}`}
                               >
                                 {isSysLog ? (
                                   <div className="w-full">
                                     <div className="flex items-center justify-between gap-2 border-b border-zinc-800/30 pb-1 mb-1 text-[8px] text-zinc-500 select-none">
                                       <div className="flex items-center gap-1.5">
                                         <span className="font-bold font-mono tracking-wide text-zinc-400">{act.type}</span>
                                         <button 
                                           onClick={() => setExpandedSystemLogs(prev => ({ ...prev, [act.id]: !isExpanded }))}
                                           className="px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-[8px] rounded border border-zinc-700/30 text-purple-400 font-mono cursor-pointer transition-colors"
                                         >
                                           {isExpanded ? "[ Collapse ▲ ]" : "[ Expand ▼ ]"}
                                         </button>
                                       </div>
                                       <span>{act.createdAt ? formatRelativeTime(act.createdAt, true) : ""}</span>
                                     </div>
                                     {isExpanded ? (
                                       <div className="whitespace-pre-wrap font-mono text-[9px] text-zinc-400 bg-zinc-950/40 p-2.5 rounded border border-zinc-850 mt-1 max-h-[160px] overflow-y-auto leading-normal select-text">
                                         {act.text}
                                       </div>
                                     ) : (
                                       <div 
                                         onClick={() => setExpandedSystemLogs(prev => ({ ...prev, [act.id]: true }))}
                                         className="cursor-pointer font-mono text-[9px] text-zinc-500 hover:text-zinc-350 truncate overflow-hidden block antialiased select-none"
                                         title="Click to reveal system output log details"
                                       >
                                         {act.text || "(empty log payload)"}
                                       </div>
                                     )}
                                   </div>
                                 ) : (
                                   <>
                                     {act.type === "user_message" && (
                                       <div className="absolute top-2.5 right-2.5 pointer-events-none bg-zinc-900/70 p-1 rounded-md border border-zinc-700/30 text-emerald-400 opacity-60 z-10 flex items-center justify-center shadow-sm">
                                         <User className="w-3 h-3" />
                                       </div>
                                     )}
                                     
                                     <div className="flex justify-between items-center text-[8px] text-zinc-500 mb-1.5 font-mono uppercase">
                                       <div className="flex items-center gap-2">
                                         <span className="font-bold">
                                           {act.type}
                                         </span>
                                         {act.type !== "system_log" && (
                                           <CopyToClipboard text={act.text || ""} showText={false} iconSize={10} className="p-0.5" />
                                         )}
                                       </div>
                                       <span>{act.createdAt ? formatRelativeTime(act.createdAt, true) : ""}</span>
                                     </div>
                                     
                                     <CollapsibleMessageText text={act.text} />
                                     
                                     {act.url && (
                                       <div className="mt-2.5">
                                         <a 
                                           href={act.url} 
                                           target="_blank" 
                                           rel="noopener noreferrer" 
                                           className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider transition-colors shadow-sm"
                                         >
                                           {act.type === 'pull_request' ? "🔗 Show PR" : "📁 Browse Branch / Commit"}
                                         </a>
                                       </div>
                                     )}

                                     {/* Rich details or artifacts attached to this activity */}
                                     {act.raw && (
                                       <div className="mt-3 space-y-2 border-t border-zinc-700/30 pt-2.5">
                                         {/* 1. Plan Generated roadmap */}
                                         {act.raw.planGenerated?.plan && (
                                           <div className="bg-zinc-950/80 rounded-xl p-3 border border-zinc-800/80">
                                             <span className="text-[9px] uppercase tracking-wider text-purple-400 font-mono font-bold block mb-2">📋 Suggested Action Plan</span>
                                             <div className="space-y-2">
                                               {act.raw.planGenerated.plan.steps?.map((step: any, sIdx: number) => (
                                                 <div key={sIdx} className="flex gap-2 text-left">
                                                   <span className="w-4 h-4 rounded-full bg-purple-900/60 text-purple-200 text-[9px] flex items-center justify-center font-bold shrink-0 mt-0.5">{sIdx + 1}</span>
                                                   <div className="flex-1">
                                                     <div className="font-bold text-zinc-200 text-[10px]">{step.title}</div>
                                                     {step.description && <div className="text-zinc-400 text-[9px] mt-0.5">{step.description}</div>}
                                                   </div>
                                                 </div>
                                               ))}
                                             </div>
                                           </div>
                                         )}

                                         {/* 2. Commit change set / patch Details */}
                                         {((act.raw.branchUpdated?.changeSet) || (act.raw.codeCommitted?.changeSet) || (act.type === 'branch_updated' && act.patch) || (act.raw.changeSet)) && (() => {
                                           const cs = act.raw.branchUpdated?.changeSet || act.raw.codeCommitted?.changeSet || act.raw.changeSet || (act.type === 'branch_updated' ? act : null);
                                           const patch = cs?.gitPatch?.unidiffPatch || act.patch;
                                           const suggestedCommitMessage = cs?.suggestedCommitMessage;
                                           if (!patch) return null;

                                           return (
                                             <JulesWebUICard 
                                               raw={act.raw} 
                                               patch={patch} 
                                               sessionId={selectedSessionId} 
                                               suggestedCommitMessage={suggestedCommitMessage} 
                                             />
                                           );
                                         })()}

                                         {/* 3. Pull Request Meta */}
                                         {(act.raw.pullRequest || act.raw.pullRequestCreated) && (() => {
                                           const pr = act.raw.pullRequest || act.raw.pullRequestCreated;
                                           return (
                                             <div className="bg-emerald-950/20 rounded-xl p-3 border border-emerald-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left">
                                               <div className="flex-1">
                                                 <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-mono font-bold block mb-1">🚀 Pull Request Created</span>
                                                 <div className="font-bold text-zinc-200 text-[10px]">{pr.title || "Jules Rollout PR"}</div>
                                                 {pr.description && <div className="text-zinc-400 text-[9px] mt-1 pr-2 max-h-[60px] overflow-y-auto no-scrollbar whitespace-pre-wrap">{pr.description}</div>}
                                               </div>
                                               {(pr.html_url || pr.url) && (
                                                 <a href={pr.html_url || pr.url} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-lg text-[9px] font-bold uppercase transition shadow-sm shrink-0">
                                                   Review PR ↗
                                                 </a>
                                               )}
                                             </div>
                                           );
                                         })()}
                                       </div>
                                     )}
                                   </>
                                 )}
                               </div>
                             );
                           })}
                        {isLoadingActivities && julesActivities.length === 0 && (
                          <div className="text-center text-cyan-400 text-xs py-12 font-mono flex flex-col items-center justify-center gap-3">
                            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                            <span>Synchronizing cloud interaction state...</span>
                          </div>
                        )}
                        {!selectedSessionId && (
                          <div className="text-center text-zinc-500 text-xs py-12 px-6 font-mono flex flex-col items-center justify-center gap-2">
                            <div className="text-[20px] mb-1">💬</div>
                            <span className="font-bold text-zinc-400">Jules Session Not Selected</span>
                            <span className="text-[10px] text-zinc-600 leading-relaxed max-w-sm">
                              すべてのセッションが削除されたかアーカイブされているため、現在選択されているアクティブセッションはありません。左側の一覧からセッションを選択するか、新しいセッションを作成してください。
                            </span>
                          </div>
                        )}
                        {selectedSessionId && !isLoadingActivities && julesActivities.length === 0 && (
                          <div className="text-center text-zinc-600 text-xs py-8 font-mono">
                            No activities recorded in this session.
                          </div>
                        )}
                      </div>

                    </div>

                  </div>
                )}

                {/* 6. Dashboard Settings Configurations */}
                {activeTab === "settings" && (
                  <div className="space-y-3" id="settings-view">
                    
                    {/* Setup repository targets */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                      
                      {/* GitHub binding card */}
                      <form onSubmit={handleSaveGitBinding} className="bg-blue-950/20 border border-blue-900/40 rounded-2xl p-4 md:p-5 shadow-xl shadow-black/35 flex flex-col justify-between">
                        <div className="border-b border-blue-900/40 pb-2.5 flex items-center gap-2 mb-4">
                          <Github className="w-4 h-4 text-blue-400" />
                          <span className="text-xs font-bold text-blue-400 uppercase font-mono tracking-widest">Connect Repository</span>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-[9px] font-bold text-zinc-400 uppercase font-mono mb-1">Repository Owner</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. TakashiSasaki"
                              value={gitOwner}
                              onChange={e => setGitOwner(e.target.value)}
                              className="w-full bg-zinc-950 border border-blue-900/30 text-xs py-1.5 px-3 rounded-xl focus:outline-none focus:border-blue-500 text-white font-mono shadow-inner"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-zinc-400 uppercase font-mono mb-1">Repository Name</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. public"
                              value={gitRepo}
                              onChange={e => setGitRepo(e.target.value)}
                              className="w-full bg-zinc-950 border border-blue-900/30 text-xs py-1.5 px-3 rounded-xl focus:outline-none focus:border-blue-500 text-white font-mono shadow-inner"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-zinc-400 uppercase font-mono mb-1">Default Branch Name</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. master"
                              value={gitDefaultBranch}
                              onChange={e => setGitDefaultBranch(e.target.value)}
                              className="w-full bg-zinc-950 border border-blue-900/30 text-xs py-1.5 px-3 rounded-xl focus:outline-none focus:border-blue-500 text-white font-mono shadow-inner"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-zinc-400 uppercase font-mono mb-1">Working Branch targeting (Optional)</label>
                            <input
                              type="text"
                              placeholder="e.g. uuidv8-fid"
                              value={gitWorkingBranch}
                              onChange={e => setGitWorkingBranch(e.target.value)}
                              className="w-full bg-zinc-950 border border-blue-900/30 text-xs py-1.5 px-3 rounded-xl focus:outline-none focus:border-blue-500 text-white font-mono shadow-inner"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-zinc-400 uppercase font-mono mb-1">Role Type</label>
                            <select
                              value={gitRole}
                              onChange={e => setGitRole(e.target.value as any)}
                              className="w-full bg-zinc-950 border border-blue-900/30 text-xs px-2 py-1.5 rounded-xl focus:outline-none text-white focus:border-blue-500 font-mono"
                            >
                              <option value="primary">primary / core backend</option>
                              <option value="frontend">frontend app</option>
                              <option value="backend">backend microservice</option>
                              <option value="spec">specification repo</option>
                              <option value="docs">docs repository</option>
                              <option value="misc">miscellaneous</option>
                            </select>
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-550 text-white text-xs font-bold py-2 px-3.5 rounded-xl transition-all cursor-pointer shadow-md mt-4 font-mono uppercase tracking-wider active:scale-95"
                          >
                            Save Repository Setting
                          </button>
                        </div>
                      </form>

                      {/* Jules configuration settings card */}
                      <form onSubmit={handleSaveJulesBinding} className="bg-purple-950/20 border border-purple-900/40 rounded-2xl p-4 md:p-5 shadow-xl shadow-black/35 flex flex-col justify-between" id="jules-binding-form">
                        <div>
                          <div className="border-b border-purple-900/40 pb-2.5 flex items-center gap-2 mb-4">
                            <Cpu className="w-4 h-4 text-purple-400" />
                            <span className="text-xs font-bold text-purple-400 uppercase font-mono tracking-widest">Configure Jules Agent Bindings</span>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="block text-[9px] font-bold text-zinc-400 uppercase font-mono mb-1">Jules Container Source ID</label>
                              <input
                                type="text"
                                placeholder="e.g. jules-assistant-01"
                                value={julesSource}
                                onChange={e => setJulesSource(e.target.value)}
                                className="w-full bg-zinc-950 border border-purple-900/30 text-xs py-1.5 px-3 rounded-xl focus:outline-none focus:border-purple-500 text-white font-mono shadow-inner"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-bold text-zinc-400 uppercase font-mono mb-1">Default Execution Branch</label>
                              <input
                                type="text"
                                placeholder="e.g. master"
                                value={julesBranch}
                                onChange={e => setJulesBranch(e.target.value)}
                                className="w-full bg-zinc-950 border border-purple-900/30 text-xs py-1.5 px-3 rounded-xl focus:outline-none focus:border-purple-500 text-white font-mono shadow-inner"
                              />
                            </div>

                            <div className="flex items-center gap-2 py-2 select-none">
                              <input
                                type="checkbox"
                                id="require-jules-approval-opt"
                                checked={julesApproval}
                                onChange={e => setJulesApproval(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-zinc-750 bg-zinc-950 accent-purple-500 text-white cursor-pointer shadow-inner"
                              />
                              <label htmlFor="require-jules-approval-opt" className="text-[10px] uppercase font-bold text-zinc-300 font-mono cursor-pointer leading-tight">
                                Require manual plan approval of suggested code patches before merging
                              </label>
                            </div>
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-purple-500 hover:bg-purple-600 text-zinc-950 text-xs font-black py-2 px-3.5 rounded-xl transition-all cursor-pointer shadow-md mt-4 font-mono uppercase tracking-wider active:scale-95"
                        >
                          Save Jules Parameters
                        </button>
                      </form>

                      {/* ChatGPT configuration settings card */}
                      <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-2xl p-4 md:p-5 shadow-xl shadow-black/35 flex flex-col justify-between" id="chatgpt-binding-form">
                        <div>
                          <div className="border-b border-emerald-900/40 pb-2.5 flex items-center gap-2 mb-4">
                            <BookOpen className="w-4 h-4 text-emerald-400" />
                            <span className="text-xs font-bold text-emerald-400 uppercase font-mono tracking-widest">ChatGPT Thread Union</span>
                          </div>

                          <p className="text-[11px] text-zinc-400 leading-relaxed font-mono mb-4">
                            Bind a single ChatGPT conversation thread URL directly to this specific workspace dashboard. No categories or extra info needed.
                          </p>

                          {chatGptLinks.length > 0 ? (
                            <div className="bg-zinc-950 p-4 rounded-xl border border-emerald-900/20 space-y-3 shadow-inner mb-4">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold text-emerald-400 font-mono tracking-wider flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                  Active Thread Bound
                                </span>
                              </div>
                              <div className="text-zinc-200 text-xs font-mono break-all py-1 px-2 border border-zinc-900 rounded bg-zinc-950 max-h-16 overflow-y-auto">
                                {chatGptLinks[0].url}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLink(chatGptLinks[0].id)}
                                  className="w-full py-1.5 px-3 bg-zinc-900 hover:bg-red-950/40 border border-zinc-850 hover:border-red-900/30 text-zinc-400 hover:text-red-400 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 text-xs font-bold font-mono uppercase tracking-wider"
                                  title="Decouple and remove thread connection URL"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Decouple Current Thread URL</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 text-center border border-dashed border-emerald-900/30 text-zinc-500 text-xs rounded-xl font-mono mb-4">
                              No ChatGPT thread bound. Enter a URL below.
                            </div>
                          )}

                          <form onSubmit={handleAddLink} className="space-y-3">
                            <div>
                              <label className="text-[9px] uppercase font-mono font-bold text-zinc-400 block mb-1">ChatGPT Thread URL</label>
                              <input
                                type="url"
                                required
                                placeholder="e.g. https://chatgpt.com/share/..."
                                value={newLinkUrl}
                                onChange={e => setNewLinkUrl(e.target.value)}
                                className="w-full bg-zinc-950 border border-emerald-900/30 py-2 px-3.5 rounded-xl focus:outline-none focus:border-emerald-500 text-xs text-white font-mono shadow-inner"
                              />
                            </div>

                            <button
                              type="submit"
                              className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-xs font-black py-2 px-3.5 rounded-xl shadow-md cursor-pointer transition active:scale-95 text-center font-mono uppercase tracking-wider"
                            >
                              {chatGptLinks.length > 0 ? "Update Bound URL" : "Link Thread URL"}
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>

                    {/* Dangerous and final settings operations */}
                    <div className="bg-zinc-900 rounded-2xl p-4 md:p-5 shadow-xl shadow-black/35">
                      <span className="text-[10px] uppercase tracking-wider text-red-500 font-bold border-b border-zinc-800/45 pb-2 mb-3 block font-mono">
                        Danger Room Operations
                      </span>
                      <p className="text-[11px] text-zinc-400 mb-4 leading-relaxed">
                        Archiving a development target stops background REST API polling and preserves state offline on server databases. It can be re-accessed later.
                      </p>
                      
                      <button
                        onClick={handleArchiveDashboard}
                        className="px-4 py-2 bg-red-950/20 border border-red-900/60 text-red-400 hover:bg-red-900 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer font-mono shadow-sm active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Archive Dashboard Target Context
                      </button>
                    </div>

                  </div>
                )}

              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-zinc-900/40 border border-dashed border-zinc-800 rounded min-h-[300px]" id="empty-state">
              <LayoutDashboard className="w-12 h-12 text-zinc-650 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-300">No active dashboard target selected</h3>
              <p className="text-xs text-zinc-500 max-w-sm mt-1 leading-normal">
                Please create a new project development dashboard target or select an existing branch environment from the left hand pane to start monitoring repositories and orchestrating plans.
              </p>
              <button
                onClick={() => {
                  setIsOpenRepoModal(true);
                  fetchGithubRepos();
                }}
                className="mt-4 px-4 py-1.5 bg-rose-500 hover:bg-rose-550 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-md hover:scale-105 transition-all font-mono cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Initialize First Workspace (Select Repo & Branch)
              </button>
            </div>
          )}

        </main>
      </div>
      )}

      {/* 🚀 GITHUB REPOSITORY SELECTION MODAL */}
      {isOpenRepoModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50" id="repo-selection-modal">
          <div className="bg-zinc-900 border border-zinc-805 w-full max-w-lg rounded-3xl shadow-2xl p-6 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60 mb-4 shrink-0">
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-200 flex items-center gap-2 font-mono">
                <Github className="w-4 h-4 text-rose-500" />
                Select Repository
              </span>
              <button
                onClick={() => {
                  setIsOpenRepoModal(false);
                  setRepoSearchKeyword("");
                }}
                className="text-zinc-400 hover:text-white bg-zinc-800/40 p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Incremental Search Input */}
            <div className="mb-4 shrink-0 relative">
              <input
                type="text"
                autoFocus
                placeholder="Type to filter repositories incrementally..."
                value={repoSearchKeyword}
                onChange={e => setRepoSearchKeyword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800/80 text-xs py-2.5 px-3.5 rounded-xl focus:outline-none focus:border-rose-500 font-mono text-zinc-100 placeholder-zinc-500 shadow-inner"
              />
            </div>

            {/* List area */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar min-h-[220px]">
              {loadingRepos ? (
                <div className="flex items-center justify-center gap-2 py-12 font-mono text-xs text-zinc-500">
                  <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
                  Fetching user repositories...
                </div>
              ) : reposError ? (
                <div className="p-4 bg-red-955/20 border border-red-900/40 rounded-2xl text-xs text-red-400 font-mono">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Error Accessing Repositories</p>
                      <p className="mt-1 text-[11px] leading-relaxed">{reposError}</p>
                      <p className="mt-2 text-zinc-400 text-[10px]">
                        Please ensure you have configured a valid GitHub Personal Access Token (PAT) in System Settings.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                (() => {
                  const filtered = ghRepos.filter(r =>
                    r.name.toLowerCase().includes(repoSearchKeyword.toLowerCase()) ||
                    r.full_name.toLowerCase().includes(repoSearchKeyword.toLowerCase())
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center text-zinc-550 text-xs italic font-mono border border-dashed border-zinc-800 rounded-2xl">
                        No repositories match your active search filter.
                      </div>
                    );
                  }

                  return filtered.map(r => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setSelectedRepo(r);
                        setIsOpenRepoModal(false);
                        setIsOpenBranchModal(true);
                        setBranchSearchKeyword("");
                        fetchGithubBranches(r.owner.login, r.name);
                      }}
                      className="w-full text-left p-3 bg-zinc-950 hover:bg-zinc-850/65 border border-zinc-850 hover:border-zinc-700 transition-all rounded-xl flex flex-col cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-200 group-hover:text-white font-mono break-all leading-normal">
                          {r.full_name}
                        </span>
                        {r.pushed_at && (
                          <span className="text-[9px] text-zinc-500 font-mono font-bold shrink-0 ml-2">
                            Pushed: {new Date(r.pushed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <p className="text-[10px] text-zinc-500 truncate mt-1 pl-1 line-clamp-1 leading-normal">
                          {r.description}
                        </p>
                      )}
                    </button>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🚀 GITHUB BRANCH SELECTION MODAL */}
      {isOpenBranchModal && selectedRepo && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50" id="branch-selection-modal">
          <div className="bg-zinc-900 border border-zinc-805 w-full max-w-lg rounded-3xl shadow-2xl p-6 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60 mb-4 shrink-0">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-200 flex items-center gap-2 font-mono">
                  <GitBranch className="w-4 h-4 text-cyan-500" />
                  Select Branch
                </span>
                <span className="text-[9px] text-zinc-500 font-mono block mt-1 leading-tight">
                  Repo: <code className="text-zinc-300">{selectedRepo.full_name}</code>
                </span>
              </div>
              <button
                onClick={() => {
                  setIsOpenBranchModal(false);
                  setBranchSearchKeyword("");
                }}
                className="text-zinc-400 hover:text-white bg-zinc-800/40 p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Incremental Search Input */}
            <div className="mb-4 shrink-0 relative">
              <input
                type="text"
                autoFocus
                placeholder="Type to filter branches incrementally..."
                value={branchSearchKeyword}
                onChange={e => setBranchSearchKeyword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800/80 text-xs py-2.5 px-3.5 rounded-xl focus:outline-none focus:border-cyan-500 font-mono text-zinc-100 placeholder-zinc-500 shadow-inner"
              />
            </div>

            {/* List Area */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar min-h-[220px]">
              {loadingBranches ? (
                <div className="flex items-center justify-center gap-2 py-12 font-mono text-xs text-zinc-500">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-500" />
                  Fetching and sorting branches...
                </div>
              ) : branchesError ? (
                <div className="p-4 bg-red-955/20 border border-red-900/40 rounded-2xl text-xs text-red-400 font-mono">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Error Loading Branches</p>
                      <p className="mt-1 text-[11px] leading-relaxed">{branchesError}</p>
                    </div>
                  </div>
                </div>
              ) : (
                (() => {
                  const filtered = ghBranches.filter(b =>
                    b.name.toLowerCase().includes(branchSearchKeyword.toLowerCase())
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center text-zinc-550 text-xs italic font-mono border border-dashed border-zinc-800 rounded-2xl">
                        No branches match your active search filter.
                      </div>
                    );
                  }

                  return filtered.map(b => (
                    <button
                      key={b.name}
                      disabled={isCreatingWorkspace}
                      onClick={() => handleSelectBranchAndCreateWorkspace(b.name)}
                      className={`w-full text-left p-3.5 bg-zinc-950 hover:bg-zinc-850/65 border border-zinc-850 hover:border-zinc-700 transition-all rounded-xl flex items-center justify-between cursor-pointer group ${
                        isCreatingWorkspace ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                    >
                      <div className="flex flex-col overflow-hidden mr-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-black text-zinc-200 group-hover:text-white font-mono truncate">
                            {b.name}
                          </span>
                          {selectedRepo?.default_branch === b.name && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[9px] text-zinc-400 font-bold tracking-wider shrink-0">DEFAULT</span>
                          )}
                        </div>
                        {b.commit?.sha && (
                          <span className="text-[9px] text-zinc-500 font-mono truncate pl-0.5">
                            SHA: <code className="text-zinc-650">{b.commit.sha.substring(0, 7)}</code>
                          </span>
                        )}
                      </div>
                      {b.lastCommitDate && (
                        <div className="text-right shrink-0">
                          <span className="text-[9px] text-zinc-550 font-mono font-bold block">
                            Last Updated
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {new Date(b.lastCommitDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </button>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}


 
      {/* Jules Raw API Response Modal */}
      {isRawResponseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 w-full max-w-4xl rounded-3xl border border-purple-500/30 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-purple-950/20">
              <div className="flex items-center gap-2 text-purple-400">
                <Code className="w-4 h-4 text-purple-400 animate-pulse" />
                <h3 className="font-mono uppercase font-black tracking-widest text-sm">Jules Raw API Responses</h3>
              </div>
              <button 
                onClick={() => setIsRawResponseOpen(false)}
                className="p-2 bg-zinc-900 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition shadow-sm cursor-pointer"
              >
                <div className="w-4 h-4 text-center leading-4 font-bold font-sans">✕</div>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-purple-950/20 border border-purple-900/30 p-4 rounded-2xl">
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-zinc-200 mb-1">Raw JSON Source payload</h4>
                  <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                    This debugger displays raw JSON structures returned directly from the Google DeepMind Jules REST API engine proxying at <span className="font-mono text-xs text-purple-300">/api/jules_proxy/*</span>.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {rawActivitiesJson && (
                    <CopyToClipboard 
                      text={rawActivitiesJson} 
                      iconSize={12} 
                      className="px-3 py-1.5 bg-purple-900 hover:bg-purple-800 text-zinc-100 font-bold uppercase text-[10px] tracking-wider rounded-xl transition cursor-pointer flex items-center gap-1.5"
                    />
                  )}
                  <button
                    onClick={handleRefreshActivities}
                    disabled={isLoadingActivities}
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-cyan-400 border border-zinc-800/80 font-bold uppercase text-[10px] tracking-wider rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingActivities ? "animate-spin" : ""}`} />
                    <span>Sync API State</span>
                  </button>
                </div>
              </div>

              {isLoadingActivities && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 min-h-[200px] border border-dashed border-zinc-800 rounded-2xl bg-black/20">
                  <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
                  <div className="text-xs text-purple-300 font-mono animate-pulse">Requesting raw payload from Jules API endpoint...</div>
                </div>
              )}

              {!isLoadingActivities && !rawActivitiesJson && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 min-h-[200px] border border-dashed border-zinc-800 rounded-2xl bg-black/20 text-center px-4">
                  <div className="text-zinc-500 font-mono text-xs">No Raw responses loaded yet.</div>
                  <div className="text-[11px] text-zinc-650 max-w-sm mb-2">Typically, raw payloads are archived automatically during synchronization when activities are pulled.</div>
                  <button
                    onClick={handleRefreshActivities}
                    className="px-4 py-2 bg-purple-900 hover:bg-purple-800 text-zinc-100 font-bold uppercase text-[10px] tracking-widest rounded-xl transition cursor-pointer"
                  >
                    Trigger initial fetch
                  </button>
                </div>
              )}

              {!isLoadingActivities && rawActivitiesJson && (
                <div className="flex flex-col flex-1">
                  <div className="text-[9px] uppercase font-mono tracking-wider text-purple-400 font-bold mb-2 flex justify-between items-center">
                    <span>Response Payload Body (JSON)</span>
                    <span className="text-zinc-655 font-normal normal-case font-mono">🔍 Active Session ID: {selectedSessionId}</span>
                  </div>
                  <div className="bg-black/85 rounded-2xl border border-purple-900/40 p-4 overflow-auto max-h-[450px] no-scrollbar shadow-inner">
                    <pre className="text-[11px] text-purple-300/90 font-mono leading-relaxed whitespace-pre-wrap break-all">
                      <code>{rawActivitiesJson}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-zinc-900 bg-zinc-950/50 flex justify-end">
              <button
                onClick={() => setIsRawResponseOpen(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Developer Admin Modal */}
      {isDeveloperModalOpen && currentUser?.email === 'takashi316@gmail.com' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 w-full max-w-2xl rounded-3xl border border-amber-500/30 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-amber-950/20">
              <div className="flex items-center gap-2 text-amber-500">
                <h3 className="font-mono uppercase font-black tracking-widest text-sm">Developer Admin Utilities</h3>
              </div>
              <button 
                onClick={() => setIsDeveloperModalOpen(false)}
                className="p-2 bg-zinc-900 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition shadow-sm cursor-pointer"
              >
                <div className="w-4 h-4 text-center">X</div>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 font-mono text-[10px]">
              <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
                <p className="text-zinc-400 mb-2 font-sans text-xs">
                  This administrative panel allows executing database-level scripts against all workspaces to enforce schema integrity and ensure seamless integration states.
                </p>
                <button
                  onClick={runAdminBatchCorrection}
                  disabled={isBatchRunning}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-zinc-950 font-black tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center gap-2"
                >
                  {isBatchRunning ? (
                    <>
                      <span className="w-3 h-3 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin"></span>
                      Executing Batch Scripts...
                    </>
                  ) : "Run Jules Validation & Correction Batch"}
                </button>
              </div>
              
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col">
                <div className="text-zinc-550 uppercase font-black tracking-widest mb-2 border-b border-zinc-800 pb-2">Execution Logs</div>
                <div className="flex-1 min-h-[150px] max-h-[250px] overflow-y-auto space-y-1 bg-black p-3 rounded-lg shadow-inner">
                  {batchLogs.length === 0 ? (
                    <div className="text-zinc-700 italic">No operations recorded yet...</div>
                  ) : (
                    batchLogs.map((log, i) => (
                      <div key={i} className="text-emerald-400">
                        <span className="text-zinc-650 mr-2">[{new Date().toLocaleTimeString()}]</span>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Jules API Diagnostic Test */}
              <div className="mt-6 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col gap-3">
                <div className="border-b border-zinc-800/40 pb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200 uppercase tracking-widest flex items-center gap-2 font-mono">
                    <Terminal className="w-4 h-4 text-purple-450" />
                    Jules API Diagnostic Test
                  </span>
                  <span className="text-[8px] font-mono uppercase px-2 py-0.5 rounded-md bg-purple-950/50 text-purple-400">
                    DIAGNOSTICS
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  Manually check response payload of Jules API <code>/v1alpha/sessions</code> targeting active secrets.
                </p>
                
                <button
                  onClick={async () => {
                    const el = document.getElementById("diagnostic-output");
                    if (el) el.innerHTML = "Fetching...";
                    try {
                      const res = await fetch("/api/jules_proxy/v1alpha/sessions", {
                        headers: { "Content-Type": "application/json" }
                      });
                      const text = await res.text();
                      if (el) {
                        try {
                          const json = JSON.parse(text);
                          el.innerHTML = JSON.stringify(json, null, 2);
                        } catch (e) {
                          el.innerHTML = text;
                        }
                      }
                    } catch (err: any) {
                      if (el) el.innerHTML = "Error: " + err.message;
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold font-mono w-fit cursor-pointer transition-colors shadow-lg self-start"
                >
                  Test GET /v1alpha/sessions
                </button>
                <div className="bg-black border border-zinc-850 rounded-xl max-h-48 overflow-y-auto">
                  <pre id="diagnostic-output" className="p-3 text-[10px] text-emerald-450 font-mono whitespace-pre-wrap select-text">
                    Awaiting execution...
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🔐 AUTHENTICATION & IDENTITY CORE ACCESS CONTROL MODAL */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-sm" id="firebase-auth-modal">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-3xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header of Modal */}
            <div className="p-5 border-b border-zinc-800/60 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-200 flex items-center gap-2 font-mono">
                <ShieldCheck className="w-4 h-4 text-rose-500 animate-pulse" />
                Identity Core Access Control
              </span>
              <button
                onClick={() => setIsAuthModalOpen(false)}
                className="text-zinc-400 hover:text-white bg-zinc-800/40 p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content inside Modal */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Optional user explanation removed per user request */}

              <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-850 flex flex-col gap-4">
                {authLoading ? (
                  <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs font-mono py-4">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    Resolving Firebase Handshake...
                  </div>
                ) : currentUser ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3.5 p-1">
                      {currentUser.photoURL ? (
                        <img 
                          src={currentUser.photoURL} 
                          alt="Avatar" 
                          className="w-12 h-12 rounded-full border border-zinc-700 shadow-md shadow-black shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-450 text-base font-black shrink-0 font-mono">
                          {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : (currentUser.email ? currentUser.email.charAt(0).toUpperCase() : "U")}
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-mono text-zinc-500 uppercase leading-none mb-1">Authenticated Account</p>
                        <p className="text-xs font-bold text-white truncate leading-normal">{currentUser.email}</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-2 mt-2 pt-4 border-t border-zinc-900">
                      {currentUser.email === 'takashi316@gmail.com' && (
                        <button
                          onClick={() => {
                            setIsAuthModalOpen(false);
                            setIsDeveloperModalOpen(true);
                          }}
                          className="w-full sm:w-auto px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 rounded-lg flex items-center justify-center gap-1.5 border border-amber-500/30 cursor-pointer shadow-sm active:scale-95 transition-all text-xs"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          <span className="font-bold uppercase tracking-wider text-[9px] font-mono font-black">Dev Admin</span>
                        </button>
                      )}
                      
                      <button 
                        onClick={async () => {
                          await logoutUser();
                          setIsAuthModalOpen(false);
                          alert("Secure session invalidated successfully.");
                        }}
                        className="w-full sm:flex-1 py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-rose-400 border border-zinc-800 hover:border-rose-500/20 rounded-xl cursor-pointer transition active:scale-95"
                      >
                        Sign Out Workspace
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        await loginWithGoogle();
                        setIsAuthModalOpen(false);
                        alert("Successfully authenticated Google Account with safe Firestore persistent context!");
                      } catch (e: any) {
                        console.error(e);
                        alert(`Access denied or cancelled: ${e.message}`);
                      }
                    }}
                    className="w-full py-3 bg-white hover:bg-zinc-200 text-zinc-950 font-black text-xs uppercase tracking-widest rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer font-mono"
                  >
                    <User className="w-4 h-4 text-rose-600" />
                    Authenticate Google Account
                  </button>
                )}
              </div>

              {/* 🔒 SECURE CREDENTIALS SECTION INSIDE MODAL */}
              <div className="border-t border-zinc-800/60 pt-6">
                <div className="border-b border-zinc-800/40 pb-3 mb-4 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200 uppercase tracking-widest flex items-center gap-2 font-mono">
                    <Lock className="w-4 h-4 text-emerald-450" />
                    Secure Credentials Configuration
                  </span>
                  <span className={`text-[8px] font-mono uppercase px-2 py-0.5 rounded-md ${
                    (secretsStatus?.githubTokenConfigured && secretsStatus?.julesApiKeyConfigured)
                      ? "bg-emerald-950/50 text-emerald-400"
                      : "bg-amber-955/50 text-amber-400"
                  }`}>
                    {(secretsStatus?.githubTokenConfigured && secretsStatus?.julesApiKeyConfigured) ? "Credentials complete" : "Keys pending"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  {/* GitHub Column Form */}
                  <form onSubmit={handleSaveGithubSecrets} className="bg-blue-950/20 p-4 rounded-2xl border border-blue-900/40 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start" id="github-pat-input-header">
                        <div>
                          <label className="block text-[9px] font-bold text-blue-400 uppercase font-mono tracking-wider mb-1">
                            GitHub PAT (Read-Only)
                          </label>
                          <div className="flex items-center gap-1.5">
                            {secretsStatus?.githubTokenConfigured ? (
                              <span className="inline-flex items-center text-[8px] font-mono font-bold bg-blue-900/65 text-blue-400 border border-blue-900/40 px-1.5 py-0.5 rounded">
                                ● 設定済み (Configured)
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-[8px] font-mono font-bold bg-amber-955/60 text-amber-500 border border-amber-900/40 px-1.5 py-0.5 rounded">
                                ○ 未設定 (Not Set)
                              </span>
                            )}
                          </div>
                        </div>
                        <a
                           href="https://github.com/settings/tokens/new"
                           target="_blank"
                           rel="noopener noreferrer"
                           onClick={() => {
                             navigator.clipboard.writeText("Project Development Dashboard");
                             setGithubPatCopied(true);
                             setTimeout(() => setGithubPatCopied(false), 3000);
                           }}
                           className="text-[9px] font-bold text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 transition hover:underline bg-zinc-950 px-2 py-1 rounded-md border border-blue-900/40"
                           id="github-pat-helper-link"
                        >
                          <span>{githubPatCopied ? "Copied Name!" : "Issue PAT"}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <input
                        type="text"
                        placeholder={secretsStatus?.githubTokenConfigured ? "•••••••••••••••••••••" : "Insert github token..."}
                        value={githubTokenInput}
                        onChange={e => setGithubTokenInput(e.target.value)}
                        className="w-full bg-zinc-950 border border-blue-900/40 text-xs px-3.5 py-2 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-inner font-mono"
                      />
                      <p className="text-[10px] text-zinc-500 leading-relaxed font-sans" id="github-pat-scopes-guide">
                        ※トークン名コピー済。リポジトリやPRの読み込み権限（<code className="text-blue-400 font-mono text-[9px] bg-zinc-950 px-1 py-0.5 rounded">repo</code>スコープまたはread-only metadata）を付与してください。
                      </p>
                    </div>
                    
                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        type="submit"
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md transition active:scale-95 text-center font-mono animate-pulse"
                      >
                        {secretsStatus?.githubTokenConfigured ? "Update Token" : "Save Token"}
                      </button>
                    </div>

                    {/* GitHub API Connection Diagnostics block */}
                    <div className="mt-2 pt-3 border-t border-blue-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-zinc-400 font-mono">Status:</span>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[9.5px] font-mono font-bold ${
                            diagnosticsStatus.githubStatus === "healthy" ? "text-emerald-400" :
                            diagnosticsStatus.githubStatus === "not_configured" ? "text-amber-500" :
                            diagnosticsStatus.githubStatus === "pending" ? "text-zinc-400" : "text-rose-500"
                          }`}>
                            {diagnosticsStatus.githubStatus === "healthy" ? "CONNECTED OK" :
                             diagnosticsStatus.githubStatus === "not_configured" ? "NOT SET" :
                             diagnosticsStatus.githubStatus === "pending" ? "PENDING" : "FAILED"}
                            {diagnosticsStatus.githubLatency !== null && ` (${diagnosticsStatus.githubLatency}ms)`}
                          </span>
                          {diagnosticsStatus.githubStatus === "healthy" && githubStatusSummary.includes("repoスコープが不足しています") && (
                             <span className="text-[8px] font-bold text-amber-500 uppercase tracking-widest bg-amber-500/10 px-1 py-0.5 rounded">
                               Warning: Missing "repo" Scope
                             </span>
                          )}
                          {diagnosticsStatus.githubStatus === "healthy" && !githubStatusSummary.includes("repoスコープが不足しています") && (
                             <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest bg-blue-500/10 px-1 py-0.5 rounded">
                               PR Permission OK
                             </span>
                          )}
                        </div>
                      </div>
                      {githubStatusSummary && (
                        <p className="p-2 text-[9px] font-mono text-zinc-400 bg-zinc-950/60 rounded-xl border border-zinc-900 break-all leading-normal">
                          {githubStatusSummary}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={runGithubDiagnostics}
                        disabled={isSweepingGithub}
                        className="w-full py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-900/30 rounded-xl font-mono text-[9px] font-bold uppercase transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${isSweepingGithub ? "animate-spin" : ""}`} />
                        GitHub 疎通確認
                      </button>
                    </div>
                  </form>

                  {/* Jules Column Form */}
                  <form onSubmit={handleSaveJulesSecrets} className="bg-purple-950/20 p-4 rounded-2xl border border-purple-900/40 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start" id="jules-api-input-header">
                        <div>
                          <label className="block text-[9px] font-bold text-purple-400 uppercase font-mono tracking-wider mb-1">
                            Jules Private API Key (Secret)
                          </label>
                          <div className="flex items-center gap-1.5">
                            {secretsStatus?.julesApiKeyConfigured ? (
                              <span className="inline-flex items-center text-[8px] font-mono font-bold bg-purple-900/60 text-purple-400 border border-purple-900/40 px-1.5 py-0.5 rounded">
                                ● 設定済み (Configured)
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-[8px] font-mono font-bold bg-amber-955/60 text-amber-500 border border-amber-950 px-1.5 py-0.5 rounded">
                                ○ 未設定 (Not Set)
                              </span>
                            )}
                          </div>
                        </div>
                        <a
                          href="https://jules.google.com/settings/api"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] font-bold text-purple-400 hover:text-purple-300 font-mono flex items-center gap-1 transition hover:underline bg-zinc-950 px-2 py-1 rounded-md border border-purple-900/40"
                          id="jules-api-helper-link"
                        >
                          <span>Issue API Key</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <input
                        type="text"
                        placeholder={secretsStatus?.julesApiKeyConfigured ? "•••••••••••••••••••••" : "Insert jules private key..."}
                        value={julesApiKeyInput}
                        onChange={e => setJulesApiKeyInput(e.target.value)}
                        className="w-full bg-zinc-950 border border-purple-900/40 text-xs px-3.5 py-2 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 shadow-inner font-mono"
                      />
                      <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
                        ※Julesエージェントをローカル、または永続セッション上で統合・動作させるためのPrivate API Keyです。
                      </p>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md transition active:scale-95 text-center font-mono animate-pulse"
                      >
                        {secretsStatus?.julesApiKeyConfigured ? "Update Key" : "Save Key"}
                      </button>
                    </div>

                    {/* Jules API Connection Diagnostics block */}
                    <div className="mt-2 pt-3 border-t border-purple-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-zinc-400 font-mono">Status:</span>
                        <span className={`text-[9.5px] font-mono font-bold ${
                          diagnosticsStatus.julesStatus === "healthy" ? "text-emerald-400" :
                          diagnosticsStatus.julesStatus === "not_configured" ? "text-amber-500" :
                          diagnosticsStatus.julesStatus === "pending" ? "text-zinc-400" : "text-rose-500"
                        }`}>
                          {diagnosticsStatus.julesStatus === "healthy" ? "CONNECTED OK" :
                           diagnosticsStatus.julesStatus === "not_configured" ? "NOT SET" :
                           diagnosticsStatus.julesStatus === "pending" ? "PENDING" : "FAILED"}
                          {diagnosticsStatus.julesLatency !== null && ` (${diagnosticsStatus.julesLatency}ms)`}
                        </span>
                      </div>
                      {julesStatusSummary && (
                        <p className="p-2 text-[9px] font-mono text-zinc-400 bg-zinc-950/60 rounded-xl border border-zinc-900 break-all leading-normal">
                          {julesStatusSummary}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={runJulesDiagnostics}
                        disabled={isSweepingJules}
                        className="w-full py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-900/30 rounded-xl font-mono text-[9px] font-bold uppercase transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${isSweepingJules ? "animate-spin" : ""}`} />
                        Jules 疎通確認
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        {isCodexDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setIsCodexDialogOpen(false)}>
            <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-lg border border-emerald-900/40 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
                <span className="text-sm font-bold text-emerald-400 uppercase font-mono tracking-widest flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  OpenAI Codex Links
                </span>
                <button onClick={() => setIsCodexDialogOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-emerald-950/20 rounded-3xl p-6 shadow-xl shadow-black/40 border border-emerald-900/40 flex flex-col justify-between">
                <div>
                  <div className="pb-2.5 mb-2.5 border-b border-emerald-900/40 flex items-center justify-between">
                    <span className="text-[10px] tracking-wide uppercase text-emerald-400 font-mono font-bold flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5" />
                      OpenAI Codex Analytics & Review
                    </span>
                    <span className="text-[8px] font-mono font-black px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-900/20">
                      OPTIMIZED LINK
                    </span>
                  </div>

                  <p className="text-[10px] text-zinc-400 leading-normal mb-3">
                    Analyze automated pull request summaries, codebase improvements, high-level code completeness indices, and active model metrics.
                  </p>

                  <div className="bg-zinc-950 p-2.5 rounded-xl border border-emerald-900/20 shadow-inner">
                    <span className="block text-[8px] font-mono font-bold uppercase text-zinc-500 mb-1">Target Endpoint</span>
                    <span className="block font-mono text-[9px] text-emerald-450 break-all select-all">
                      https://chatgpt.com/codex/cloud/settings/analytics#code-review
                    </span>
                  </div>
                </div>

                <a
                  href="https://chatgpt.com/codex/cloud/settings/analytics#code-review"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full mt-3 py-2.5 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600 hover:to-teal-600 border border-emerald-500/30 hover:border-emerald-500 text-emerald-450 hover:text-zinc-950 font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-95 duration-200 font-mono text-center"
                >
                  <span>Open Codex Code Review</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {isGithubBillingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={() => setIsGithubBillingModalOpen(false)}>
            <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-lg border border-blue-900/40 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                <span className="text-sm font-bold text-blue-400 uppercase font-mono tracking-widest flex items-center gap-2">
                  <Github className="w-5 h-5" />
                  GitHub Billing & Usage Links
                </span>
                <button onClick={() => setIsGithubBillingModalOpen(false)} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-[11px] text-zinc-400 leading-normal font-sans">
                Access the official GitHub telemetry, billing and Copilot AI usage pages for your active developer account.
              </p>

              <div className="space-y-4">
                {/* GitHub Copilot AI Usage Gateway */}
                <div className="bg-zinc-950/60 rounded-2xl p-4 border border-blue-900/20 shadow-inner flex flex-col justify-between">
                  <div>
                    <div className="pb-2 mb-2 border-b border-blue-900/30 flex items-center justify-between">
                      <span className="text-[10px] tracking-wide uppercase text-blue-400 font-mono font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-blue-450" />
                        GitHub Copilot AI Usage & Billing
                      </span>
                      <span className="text-[8px] font-mono font-black px-1.5 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-900/20">
                        COPILOT
                      </span>
                    </div>

                    <p className="text-[10px] text-zinc-400 leading-normal mb-3 font-sans">
                      Monitor team and model billing, active tokens, and design suggestions via the official telemetry dashboards.
                    </p>

                    <div className="space-y-2 bg-zinc-905 p-2.5 rounded-xl border border-blue-900/20">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-zinc-500">Auto-Detected ID:</span>
                        <span className="text-blue-100 font-bold truncate max-w-[150px]" title={githubUser.id ? `${githubUser.id} (${githubUser.login || 'User'})` : "Not Sync'd"}>
                          {githubUser.id ? `${githubUser.id} (${githubUser.login || 'User'})` : "Not Sync'd"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-bold text-zinc-500 uppercase font-mono tracking-wider">Manual Customer ID Override</label>
                        <input
                          type="text"
                          placeholder={githubUser.id ? `Auto-detected: ${githubUser.id}` : "e.g. 14972826"}
                          value={customGithubUserId}
                          onChange={e => {
                            setCustomGithubUserId(e.target.value);
                            localStorage.setItem("gh_custom_user_id", e.target.value);
                          }}
                          className="w-full bg-zinc-950 border border-blue-900/30 text-[10px] py-1 px-2.5 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {customGithubUserId || githubUser.id ? (
                    <a
                      href={`https://github.com/settings/billing/ai_usage?period=3&group=7&customer=${customGithubUserId || githubUser.id}&chart_selection=2&view=models`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full mt-3 py-2 bg-gradient-to-r from-blue-600/20 to-sky-600/20 hover:from-blue-600 hover:to-sky-600 border border-blue-500/30 hover:border-blue-500 text-blue-450 hover:text-zinc-950 font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-95 duration-200 font-mono text-center"
                    >
                      <span>Open Copilot AI Usage Settings</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-full mt-3 py-2 bg-zinc-805 text-zinc-500 border border-zinc-850 font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 cursor-not-allowed font-mono text-center"
                      title="Please save or detect a valid Github User/Customer ID to access this link"
                    >
                      <span>Enter Customer ID to access link</span>
                    </button>
                  )}
                </div>

                {/* GitHub General Billing & Usage */}
                <div className="bg-zinc-950/60 rounded-2xl p-4 border border-blue-900/20 shadow-inner flex flex-col justify-between">
                  <div>
                    <div className="pb-2 mb-2 border-b border-blue-900/30 flex items-center justify-between">
                      <span className="text-[10px] tracking-wide uppercase text-blue-400 font-mono font-bold flex items-center gap-1.5">
                        <CreditCard className="w-3 h-3 text-blue-450" />
                        GitHub Billing & Usage
                      </span>
                      <span className="text-[8px] font-mono font-black px-1.5 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-900/20">
                        BILLING
                      </span>
                    </div>

                    <p className="text-[10px] text-zinc-400 leading-normal mb-3 font-sans">
                      Monitor overall account or organization billing details, subscriptions, payment plans, and direct resource limits.
                    </p>

                    <div className="bg-zinc-905 p-2.5 rounded-xl border border-blue-900/20 shadow-inner">
                      <span className="block text-[8px] font-mono font-bold uppercase text-zinc-500 mb-1">Target Endpoint</span>
                      <span className="block font-mono text-[9px] text-blue-450 break-all select-all">
                        {customGithubUserId || githubUser.id 
                          ? `https://github.com/settings/billing/usage?period=3&group=0&customer=${customGithubUserId || githubUser.id}`
                          : "No Customer ID (Enter manually or sweep PAT)"}
                      </span>
                    </div>
                  </div>

                  {customGithubUserId || githubUser.id ? (
                    <a
                      href={`https://github.com/settings/billing/usage?period=3&group=0&customer=${customGithubUserId || githubUser.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full mt-3 py-2 bg-gradient-to-r from-blue-600/20 to-sky-600/20 hover:from-blue-600 hover:to-sky-600 border border-blue-500/30 hover:border-blue-500 text-blue-450 hover:text-zinc-950 font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-95 duration-200 font-mono text-center"
                    >
                      <span>Open GitHub Billing Usage</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-full mt-3 py-2 bg-zinc-805 text-zinc-500 border border-zinc-850 font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 cursor-not-allowed font-mono text-center"
                      title="Please save or detect a valid Github User/Customer ID to access this link"
                    >
                      <span>Enter Customer ID to access link</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isChatGptDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setIsChatGptDialogOpen(false)}>
            <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-lg border border-emerald-900/40 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
                    <span className="text-sm font-bold text-emerald-400 uppercase font-mono tracking-widest flex items-center gap-2">
                        <BookOpen className="w-5 h-5" />
                        ChatGPT Thread Union
                    </span>
                    <button onClick={() => setIsChatGptDialogOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                  <p className="text-[11px] text-zinc-400 leading-relaxed font-mono mb-4">
                    Bind a single ChatGPT conversation thread URL directly to this specific workspace dashboard. No categories or extra info needed.
                  </p>

                  {chatGptLinks.length > 0 ? (
                    <div className="bg-zinc-950 p-4 rounded-xl border border-emerald-900/20 space-y-3 shadow-inner mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-emerald-400 font-mono tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          Active Thread Bound
                        </span>
                      </div>
                      <div className="text-zinc-200 text-xs font-mono break-all py-1 px-2 border border-zinc-900 rounded bg-zinc-950 max-h-16 overflow-y-auto">
                        {chatGptLinks[0].url}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteLink(chatGptLinks[0].id)}
                          className="w-full py-1.5 px-3 bg-zinc-900 hover:bg-red-950/40 border border-zinc-850 hover:border-red-900/30 text-zinc-400 hover:text-red-400 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 text-xs font-bold font-mono uppercase tracking-wider"
                          title="Decouple and remove thread connection URL"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Decouple Current Thread URL</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center border border-dashed border-emerald-900/30 text-zinc-500 text-xs rounded-xl font-mono mb-4">
                      No ChatGPT thread bound. Enter a URL below.
                    </div>
                  )}

                  <form onSubmit={handleAddLink} className="space-y-3">
                    <div>
                      <label className="text-[9px] uppercase font-mono font-bold text-zinc-400 block mb-1">ChatGPT Thread URL</label>
                      <input
                        type="url"
                        required
                        placeholder="e.g. https://chatgpt.com/share/..."
                        value={newLinkUrl}
                        onChange={e => setNewLinkUrl(e.target.value)}
                        className="w-full bg-zinc-950 border border-emerald-900/30 py-2 px-3.5 rounded-xl focus:outline-none focus:border-emerald-500 text-xs text-white font-mono shadow-inner"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-xs font-black py-2 px-3.5 rounded-xl shadow-md cursor-pointer transition active:scale-95 text-center font-mono uppercase tracking-wider"
                      onClick={() => setTimeout(() => setIsChatGptDialogOpen(false), 500)}
                    >
                      {chatGptLinks.length > 0 ? "Update Bound URL" : "Link Thread URL"}
                    </button>
                  </form>
            </div>
          </div>
        )}
      
      </div>
  );
}
