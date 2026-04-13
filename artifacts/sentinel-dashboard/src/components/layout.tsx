import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  ListTree,
  Cpu,
  FileCheck,
  ShieldCheck,
  Search,
  Bell,
  GitBranch,
  ShieldAlert,
  X,
  Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetIntegrityStatus } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PendingNotification {
  id: string;
  agentId: string;
  actionType: string;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [pendingNotifications, setPendingNotifications] = useState<PendingNotification[]>([]);
  const [killActive, setKillActive] = useState(false);
  const [showNotif, setShowNotif] = useState(false);

  // WebSocket — listen for governance events
  useEffect(() => {
    const protocol = location.startsWith("https") ? "wss" : "ws";
    const ws = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${BASE}/api/v1/ws`);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "pending_approval") {
          const { id, agentId, actionType } = msg.data;
          setPendingNotifications((prev) => {
            if (prev.some((n) => n.id === id)) return prev;
            return [{ id, agentId, actionType }, ...prev].slice(0, 5);
          });
          setShowNotif(true);
          // Browser notification
          if (Notification.permission === "granted") {
            new Notification("Agent-Sentinel: Authorization Required", {
              body: `Agent ${agentId} wants to execute ${actionType}. Approve or deny in the War Room.`,
              icon: "/favicon.ico",
            });
          }
        }
        if (msg.type === "kill_switch") {
          setKillActive(msg.data?.active ?? false);
        }
        if (msg.type === "auth_resolved") {
          const { id } = msg.data;
          setPendingNotifications((prev) => prev.filter((n) => n.id !== id));
        }
      } catch {}
    };

    // Request browser notification permission
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => ws.close();
  }, []);

  const navGroups = [
    {
      label: "Operations",
      items: [
        { path: "/", label: "Live Stream", icon: Activity },
        { path: "/traces", label: "Traces", icon: ListTree },
        { path: "/topology", label: "Topology", icon: GitBranch },
      ],
    },
    {
      label: "Governance",
      items: [
        { path: "/warroom", label: "War Room", icon: ShieldAlert, badge: pendingNotifications.length || undefined },
        { path: "/registry", label: "Registry", icon: Cpu },
        { path: "/compliance", label: "Compliance", icon: FileCheck },
        { path: "/integrity", label: "Hash Chain", icon: ShieldCheck },
        { path: "/badge", label: "Sentinel Badge", icon: Award },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row dark">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border bg-card flex flex-col flex-shrink-0 relative z-10">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="w-2 h-2 rounded-full bg-primary mr-3 shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
          <h1 className="font-mono font-bold tracking-tight text-foreground">AGENT-SENTINEL</h1>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-widest pl-2">
                {group.label}
              </div>
              <nav className="space-y-1">
                {group.items.map((item) => {
                  const active = location === item.path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={cn(
                        "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors group",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "mr-3 h-4 w-4",
                          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                      {item.label}
                      {(item as any).badge ? (
                        <span className="ml-auto px-1.5 py-0.5 rounded bg-destructive text-white text-[10px] font-mono font-bold min-w-[18px] text-center animate-pulse">
                          {(item as any).badge}
                        </span>
                      ) : active ? (
                        <div className="ml-auto w-1 h-4 bg-primary rounded-full" />
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded flex items-center justify-center border ${killActive ? "border-destructive bg-destructive/20" : "border-border bg-muted"}`}
            >
              <ShieldCheck className={`h-4 w-4 ${killActive ? "text-destructive" : "text-muted-foreground"}`} />
            </div>
            <div>
              <div className="text-xs font-medium">System Status</div>
              <div
                className={`text-[10px] font-mono flex items-center gap-1 mt-0.5 ${killActive ? "text-destructive" : "text-primary"}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${killActive ? "bg-destructive" : "bg-primary"} animate-pulse`} />
                {killActive ? "KILL-SWITCH ACTIVE" : "ONLINE"}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center text-sm font-mono text-muted-foreground">
            {navGroups.flatMap((g) => g.items).find((item) => item.path === location)?.label?.toUpperCase()} /{" "}
            <span className="text-foreground ml-2">OVERVIEW</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Search logs, hashes, traces..."
                className="w-64 h-9 bg-muted/50 border border-border rounded-md pl-9 pr-4 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="w-px h-6 bg-border" />
            <button
              onClick={() => setShowNotif(!showNotif)}
              className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-muted transition-colors relative"
            >
              <Bell className="w-4 h-4 text-muted-foreground" />
              {pendingNotifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive animate-pulse" />
              )}
            </button>
          </div>
        </header>

        {/* Notification Dropdown */}
        {showNotif && pendingNotifications.length > 0 && (
          <div className="absolute top-16 right-4 w-80 z-50 bg-card border border-border rounded-lg shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-border/60">
              <span className="text-xs font-mono font-bold text-destructive flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                PENDING APPROVALS ({pendingNotifications.length})
              </span>
              <button onClick={() => setShowNotif(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {pendingNotifications.map((n) => (
              <div key={n.id} className="p-3 border-b border-border/40 hover:bg-muted/20">
                <div className="text-xs font-mono text-foreground font-bold">{n.agentId}</div>
                <div className="text-[10px] font-mono text-destructive mt-0.5">wants to: {n.actionType}</div>
                <Link href="/warroom" className="text-[10px] font-mono text-primary hover:underline mt-1 block" onClick={() => setShowNotif(false)}>
                  → Go to War Room to approve/deny
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 bg-background relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.05),rgba(255,255,255,0))] pointer-events-none" />
          <div className="max-w-7xl mx-auto relative z-10">{children}</div>
        </div>
      </main>
    </div>
  );
}
