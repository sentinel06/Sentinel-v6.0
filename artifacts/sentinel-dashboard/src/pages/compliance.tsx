import React, { useState } from "react";
import { useGetAgents } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCheck, Download, Loader2, FileText, ShieldCheck, Lock } from "lucide-react";
import { formatTime, formatDate } from "@/lib/audit-utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function CompliancePage() {
  const { data: agentData } = useGetAgents({ query: { queryKey: ["agents"] } });

  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [timeRange, setTimeRange] = useState<string>("24h");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  const handleGenerate = async () => {
    if (!selectedAgent) return;
    setIsGenerating(true);
    try {
      const endTime = new Date().toISOString();
      const startTime = new Date();
      if (timeRange === "1h") startTime.setHours(startTime.getHours() - 1);
      else if (timeRange === "24h") startTime.setHours(startTime.getHours() - 24);
      else if (timeRange === "7d") startTime.setDate(startTime.getDate() - 7);
      else if (timeRange === "30d") startTime.setDate(startTime.getDate() - 30);

      const params = new URLSearchParams({
        agentId: selectedAgent,
        startTime: startTime.toISOString(),
        endTime,
        format: "json",
      });
      const report = await fetch(`${BASE}/api/v1/compliance/export?${params.toString()}`).then((r) => r.json());
      setReportData(report);
    } catch (error) {
      console.error("Failed to generate report:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadJSON = () => {
    if (!reportData) return;
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance_report_${selectedAgent}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const params = new URLSearchParams();
      if (selectedAgent) params.set("agentId", selectedAgent);

      // Add time range if set
      if (timeRange && selectedAgent) {
        const endTime = new Date().toISOString();
        const startTime = new Date();
        if (timeRange === "1h") startTime.setHours(startTime.getHours() - 1);
        else if (timeRange === "24h") startTime.setHours(startTime.getHours() - 24);
        else if (timeRange === "7d") startTime.setDate(startTime.getDate() - 7);
        else if (timeRange === "30d") startTime.setDate(startTime.getDate() - 30);
        params.set("startTime", startTime.toISOString());
        params.set("endTime", endTime);
      }

      const r = await fetch(`${BASE}/api/v1/export/audit-pdf?${params.toString()}`);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sentinel-evidence-bag-${selectedAgent || "full"}-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <FileCheck className="w-6 h-6 text-primary" />
          Compliance Export
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Generate immutable audit reports and signed PDF evidence packages for regulatory filing
        </p>
      </div>

      {/* PDF Evidence Bag Highlight */}
      <Card className="p-5 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 border border-primary/20">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-mono font-bold text-sm text-foreground flex items-center gap-2">
              Signed PDF Evidence Package
              <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20">EU AI ACT ART. 12/14</span>
            </h3>
            <p className="text-xs text-muted-foreground font-mono mt-1.5 leading-relaxed">
              Generates a 3-page cryptographically-sealed PDF containing the full audit log table with SHA-256 hash chains, HMAC document seal, human intervention log (Art. 14), and multi-agent topology chain map. Suitable for legal review and regulatory submission.
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              <Button
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF}
                className="font-mono text-sm gap-2"
              >
                {isGeneratingPDF
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Download className="w-4 h-4" />}
                {isGeneratingPDF ? "Generating Evidence Bag…" : "Download Evidence Bag (PDF)"}
              </Button>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                HMAC-SHA256 document seal · hash chain proof · human approval timestamps
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* JSON Report Generator */}
      <Card className="p-6 border-border/60 bg-card/50 backdrop-blur-sm">
        <h3 className="font-mono font-medium text-sm text-foreground mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          Agent-Specific JSON Report
        </h3>
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
            variant="outline"
            className="font-mono"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileCheck className="w-4 h-4 mr-2" />}
            Generate JSON Report
          </Button>
          <p className="text-xs font-mono text-muted-foreground max-w-xs">
            Includes full hash chains proving immutability for the selected timeframe.
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
                <h3 className="font-mono font-medium text-foreground">JSON Report Ready</h3>
                <p className="text-xs font-mono text-muted-foreground">
                  Generated {formatDate(reportData.generatedAt)} at {formatTime(reportData.generatedAt)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleDownloadJSON} variant="outline" className="font-mono border-border/50 hover:bg-muted/20" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Download JSON
              </Button>
              <Button onClick={handleDownloadPDF} disabled={isGeneratingPDF} variant="outline" className="font-mono border-primary/30 hover:bg-primary/10" size="sm">
                {isGeneratingPDF ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2 text-primary" />}
                Download PDF
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-background/50 rounded-md border border-border/50">
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Agent</div>
              <div className="font-mono text-sm truncate" title={reportData.agentId}>{reportData.agentId}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Events Logged</div>
              <div className="font-mono text-sm">{reportData.totalEvents?.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Anomalies</div>
              <div className={`font-mono text-sm ${reportData.anomalyCount > 0 ? "text-accent font-bold" : ""}`}>
                {reportData.anomalyCount}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Integrity</div>
              <div className={`font-mono text-sm font-bold ${reportData.integrityVerified ? "text-emerald-500" : "text-destructive"}`}>
                {reportData.integrityVerified ? "VERIFIED" : "FAILED"}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
