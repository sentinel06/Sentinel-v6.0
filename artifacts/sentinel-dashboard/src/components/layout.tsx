import React from "react";
import { Link, useLocation } from "wouter";
import { 
  Activity, 
  ListTree, 
  Cpu, 
  FileCheck, 
  ShieldCheck,
  Search,
  Bell
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetIntegrityStatus } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { path: "/", label: "Live Stream", icon: Activity },
    { path: "/traces", label: "Traces", icon: ListTree },
    { path: "/agents", label: "Registry", icon: Cpu },
    { path: "/compliance", label: "Compliance", icon: FileCheck },
    { path: "/integrity", label: "Hash Chain", icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row dark">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border bg-card flex flex-col flex-shrink-0 relative z-10">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="w-2 h-2 rounded-full bg-primary mr-3 shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
          <h1 className="font-mono font-bold tracking-tight text-foreground">AGENT-SENTINEL</h1>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="text-xs font-mono text-muted-foreground mb-4 uppercase tracking-widest pl-2">
            Operations
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors group",
                    active 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("mr-3 h-4 w-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  {item.label}
                  {active && (
                    <div className="ml-auto w-1 h-4 bg-primary rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center border border-border">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-xs font-medium">System Status</div>
              <div className="text-[10px] text-primary font-mono flex items-center gap-1 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                ONLINE
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
            {navItems.find(item => item.path === location)?.label.toUpperCase()} / <span className="text-foreground ml-2">OVERVIEW</span>
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
            <button className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-muted transition-colors relative">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-accent" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 bg-background relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.05),rgba(255,255,255,0))] pointer-events-none" />
          <div className="max-w-7xl mx-auto relative z-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}