import { Component, ErrorInfo, ReactNode } from "react";
import { ShieldAlert, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Sentinel ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: "2rem",
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            maxWidth: 480,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(255,0,60,0.1)",
              border: "1px solid rgba(255,0,60,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldAlert size={24} style={{ color: "#FF003C" }} />
          </div>

          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "#FF003C",
              fontWeight: 600,
            }}
          >
            RENDER FAULT DETECTED
          </div>

          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#F9FAFB",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {this.props.fallbackLabel ?? "This page encountered an error"}
          </div>

          <div
            style={{
              fontSize: 12,
              color: "#64748B",
              lineHeight: 1.6,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            The rest of the dashboard is still operational. Reload this view or
            navigate to another section.
          </div>

          {this.state.error && (
            <div
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(255,0,60,0.06)",
                border: "1px solid rgba(255,0,60,0.2)",
                fontSize: 11,
                color: "#94A3B8",
                textAlign: "left",
                wordBreak: "break-all",
              }}
            >
              {this.state.error.message}
            </div>
          )}

          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              padding: "10px 20px",
              borderRadius: 8,
              background: "rgba(0,245,255,0.08)",
              border: "1px solid rgba(0,245,255,0.25)",
              color: "#00F5FF",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "Inter, system-ui, sans-serif",
              letterSpacing: "0.04em",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }
}
