import React, { useState } from "react";
import { useGetAgents, useExportComplianceReport } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCheck, Download, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { formatTime, formatDate } from "@/lib/audit-utils";

export default function CompliancePage() {
  const { data: agentData } = useGetAgents({ query: { queryKey: ['agents'] }});
  
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [timeRange, setTimeRange] = useState<string>("24h");
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  // Instead of using the hook directly which triggers on render, we use it conditionally
  // or fetch manually. Since we are using Orval generated hooks, we'll configure it to be disabled until needed.
  // Actually, we need to pass params, so we compute them when needed.
  
  const handleGenerate = async () => {
    if (!selectedAgent) return;
    
    setIsGenerating(true);
    
    try {
      const endTime = new Date().toISOString();
      let startTime = new Date();
      
      if (timeRange === "1h") startTime.setHours(startTime.getHours() - 1);
      else if (timeRange === "24h") startTime.setHours(startTime.getHours() - 24);
      else if (timeRange === "7d") startTime.setDate(startTime.getDate() - 7);
      else if (timeRange === "30d") startTime.setDate(startTime.getDate() - 30);

      const params = new URLSearchParams({
        agentId: selectedAgent,
        startTime: startTime.toISOString(),
        endTime: endTime,
        format: "json",
      });
      const report = await fetch(`/api/v1/compliance/export?${params.toString()}`).then((r) => r.json());
      
      setReportData(report);
    } catch (error) {
      console.error("Failed to generate report:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!reportData) return;
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_report_${selectedAgent}_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compliance Export</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">Generate immutable audit reports for regulatory filing</p>
      </div>

      <Card className="p-6 border-border/60 bg-card/50 backdrop-blur-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="space-y-3">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Target Agent</Label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="font-mono bg-background border-border/50">
                <SelectValue placeholder="Select Agent ID" />
              </SelectTrigger>
              <SelectContent>
                {agentData?.agents?.map((agent) => (
                  <SelectItem key={agent.agentId} value={agent.agentId} className="font-mono">
                    {agent.agentId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Time Horizon</Label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="font-mono bg-background border-border/50">
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h" className="font-mono">Last 1 Hour</SelectItem>
                <SelectItem value="24h" className="font-mono">Last 24 Hours</SelectItem>
                <SelectItem value="7d" className="font-mono">Last 7 Days</SelectItem>
                <SelectItem value="30d" className="font-mono">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t border-border/40 pt-6">
          <Button 
            onClick={handleGenerate} 
            disabled={!selectedAgent || isGenerating}
            className="font-mono"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileCheck className="w-4 h-4 mr-2" />}
            Generate Report
          </Button>
          
          <p className="text-xs font-mono text-muted-foreground max-w-xs">
            Reports include full hash chains proving immutability for the selected timeframe.
          </p>
        </div>
      </Card>

      {reportData && (
        <Card className="p-6 border-primary/30 bg-primary/5 animate-in slide-in-from-bottom-4 fade-in duration-500">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <FileCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-mono font-medium text-foreground">Report Ready</h3>
                <p className="text-xs font-mono text-muted-foreground">Generated {formatDate(reportData.generatedAt)} at {formatTime(reportData.generatedAt)}</p>
              </div>
            </div>
            
            <Button onClick={handleDownload} variant="outline" className="font-mono border-primary/30 hover:bg-primary/10">
              <Download className="w-4 h-4 mr-2 text-primary" />
              Download JSON
            </Button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-background/50 rounded-md border border-border/50">
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Agent</div>
              <div className="font-mono text-sm truncate" title={reportData.agentId}>{reportData.agentId}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Events Logged</div>
              <div className="font-mono text-sm">{reportData.totalEvents.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Anomalies</div>
              <div className={`font-mono text-sm ${reportData.anomalyCount > 0 ? 'text-accent font-bold' : ''}`}>
                {reportData.anomalyCount}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Integrity</div>
              <div className={`font-mono text-sm font-bold ${reportData.integrityVerified ? 'text-emerald-500' : 'text-destructive'}`}>
                {reportData.integrityVerified ? 'VERIFIED' : 'FAILED'}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}