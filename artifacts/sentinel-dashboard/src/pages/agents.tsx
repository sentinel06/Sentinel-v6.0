import React from "react";
import { useGetAgents } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTime, formatDate } from "@/lib/audit-utils";
import { Cpu, AlertTriangle, Activity, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function AgentsPage() {
  const { data: agentData, isLoading } = useGetAgents({ query: { queryKey: ['agents'] }});
  const [search, setSearch] = React.useState("");

  const agents = agentData?.agents || [];
  
  const filteredAgents = agents.filter(a => 
    a.agentId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent Registry</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">Directory of all known autonomous actors</p>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search agents..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card/50 border-border/60 font-mono text-sm h-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <Card key={i} className="p-6 border-border/60 bg-card/50 h-32 animate-pulse" />
          ))}
        </div>
      ) : filteredAgents.length === 0 ? (
        <Card className="p-12 text-center border-border/60 bg-card/50 backdrop-blur-sm">
          <Cpu className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-mono text-lg font-medium text-foreground mb-1">No Agents Found</h3>
          <p className="text-sm text-muted-foreground font-mono">No autonomous agents have been registered or match your search.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map(agent => (
            <Card key={agent.agentId} className="border-border/60 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-colors group relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full ${agent.anomalyCount > 0 ? 'bg-accent' : 'bg-primary/30'}`} />
              
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center border border-border/50 text-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-mono text-sm font-bold text-foreground" title={agent.agentId}>
                        {agent.agentId.length > 16 ? `${agent.agentId.substring(0,16)}...` : agent.agentId}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Activity className="w-3 h-3 text-emerald-500" /> Active
                      </div>
                    </div>
                  </div>
                  
                  {agent.anomalyCount > 0 && (
                    <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 flex items-center gap-1 text-[10px] px-1.5 h-5">
                      <AlertTriangle className="w-3 h-3" />
                      {agent.anomalyCount}
                    </Badge>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-border/40">
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Total Events</div>
                    <div className="font-mono text-lg font-semibold">{agent.totalEvents.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Last Seen</div>
                    <div className="font-mono text-xs text-foreground/80 pt-1">
                      {formatDate(agent.lastSeen)}<br/>
                      <span className="text-muted-foreground">{formatTime(agent.lastSeen)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}