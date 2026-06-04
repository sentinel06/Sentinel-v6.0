import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
} from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { ForensicProvider } from "@/contexts/ForensicContext";
import { WsProvider } from "@/contexts/WsContext";

// Eagerly-loaded pages (small, common entry points or shared chrome).
import DashboardPage from "@/pages/dashboard";
import LandingPage from "@/pages/landing";
import TracesPage from "@/pages/traces";
import AgentsPage from "@/pages/agents";
import CompliancePage from "@/pages/compliance";
import IntegrityPage from "@/pages/integrity";
import TopologyPage from "@/pages/topology";
import BadgePage from "@/pages/badge";
import PulsePage from "@/pages/pulse";
import StatusPage from "@/pages/status";
import OnboardingPage from "@/pages/onboarding";
import SettingsPage from "@/pages/settings";
import SupportPage from "@/pages/support";

// Lazy-loaded pages — see notes in original App.tsx.
const WarRoomPage = lazy(() => import("@/pages/warroom"));
const SwarmMapPage = lazy(() => import("@/pages/swarmmap"));
const PartnerPortalPage = lazy(() => import("@/pages/partnerportal"));
const PartnerOnboardingPage = lazy(() => import("@/pages/partneronboarding"));
const EQAPage = lazy(() => import("@/pages/eqa"));

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--sv-text-muted, #6b7280)",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11,
        letterSpacing: "0.08em",
      }}
    >
      LOADING…
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

// ── Clerk configuration ────────────────────────────────────────────────────
// We deploy as a single app (not multiple Clerk custom domains), so the
// publishable key is read straight from the env. publishableKeyFromHost is
// for multi-tenant custom-domain setups and synthesizes a junk key when
// hostname is "localhost", breaking dev.
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Empty in dev, set automatically in prod by the Replit deployment.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment");
}

// Sentinel Command Center palette (mirrors index.css --cmd-* tokens).
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.png`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#00F5FF",
    colorForeground: "#E5E7EB",
    colorMutedForeground: "#9AA4B1",
    colorDanger: "#FF003C",
    colorBackground: "#0A0A0A",
    colorInput: "#050505",
    colorInputForeground: "#E5E7EB",
    colorNeutral: "#2C3136",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[#0A0A0A] border border-white/10 rounded-2xl w-[440px] max-w-full overflow-hidden backdrop-blur-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white",
    headerSubtitle: "text-[#9AA4B1]",
    socialButtonsBlockButton:
      "border-white/15 bg-white/5 hover:bg-white/10 transition-colors",
    socialButtonsBlockButtonText: "text-white font-medium",
    formFieldLabel: "text-[#CBD5E1] text-xs uppercase tracking-wider",
    formFieldInput:
      "bg-[#050505] border-white/10 text-white placeholder:text-[#6b7280]",
    formButtonPrimary:
      "bg-[#00F5FF] hover:bg-[#00d4dc] text-[#050505] font-semibold uppercase tracking-wider",
    footerActionText: "text-[#9AA4B1]",
    footerActionLink: "text-[#00F5FF] hover:text-[#00d4dc] font-medium",
    footerAction: "",
    dividerLine: "bg-white/10",
    dividerText: "text-[#6b7280]",
    identityPreviewEditButton: "text-[#00F5FF]",
    formFieldSuccessText: "text-[#00F5FF]",
    alert: "bg-[#FF003C]/10 border border-[#FF003C]/30",
    alertText: "text-[#FF003C]",
    otpCodeFieldInput: "bg-[#050505] border-white/10 text-white",
    formFieldRow: "",
    main: "",
    logoBox: "h-10",
    logoImage: "h-10 w-auto",
  },
};

const DEFAULT_TITLE = "Agent-Sentinel — Immutable Audit Ledger for AI Agents";

function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
    return () => { document.title = DEFAULT_TITLE; };
  }, [title]);
}

function SignInPage() {
  usePageTitle("Sign In | Agent-Sentinel");
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 page-transition">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={`${basePath}/dashboard`}
      />
    </div>
  );
}

function SignUpPage() {
  usePageTitle("Sign Up | Agent-Sentinel");
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 page-transition">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/onboarding`}
      />
    </div>
  );
}

// Landing page stays public; signed-in users get redirected straight into
// the dashboard so they don't have to click through it on every visit.
function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

// Checks whether the signed-in user already has a Sentinel key.
// If not (404 from /me/key), redirect them to /onboarding so they go
// through key provisioning before hitting the main dashboard.
// If the check errors for any other reason we let them through rather
// than blocking the UI.
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "has-key" | "no-key">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`${basePath}/api/v1/me/key`, { credentials: "include" })
      .then((r) => {
        if (cancelled) return;
        setStatus(r.status === 404 ? "no-key" : "has-key");
      })
      .catch(() => {
        if (!cancelled) setStatus("has-key");
      });
    return () => { cancelled = true; };
  }, []);

  if (status === "loading") return <RouteFallback />;
  if (status === "no-key") return <Redirect to="/onboarding" />;
  return <>{children}</>;
}

// Wraps every authenticated dashboard route. Signed-out visitors are bounced
// to /sign-in; signed-in users get the normal Layout chrome.
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

// Invalidate the React Query cache when the signed-in user changes so a
// previous user's data never bleeds into the next session.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function Router() {
  return (
    <Switch>
      {/* Public auth screens — must come before the catch-all Layout route. */}
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />

      {/* Public landing — redirects authed users to /dashboard. */}
      <Route path="/" component={HomeRoute} />

      {/* All authenticated dashboard routes. Wrapped in <Protected> inside
          the Layout so the chrome (sidebar/header) only renders for
          signed-in users; signed-out visitors bounce to /sign-in. */}
      <Route>
        <Protected>
          <Layout>
            <ErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
                <Switch>
                  <Route path="/dashboard">
                    <OnboardingGate>
                      <DashboardPage />
                    </OnboardingGate>
                  </Route>
                  <Route path="/onboarding" component={OnboardingPage} />
                  <Route path="/settings" component={SettingsPage} />
                  <Route path="/traces" component={TracesPage} />
                  <Route path="/topology" component={TopologyPage} />
                  <Route path="/warroom" component={WarRoomPage} />
                  <Route path="/agents" component={AgentsPage} />
                  <Route path="/registry" component={AgentsPage} />
                  <Route path="/compliance" component={CompliancePage} />
                  <Route path="/integrity" component={IntegrityPage} />
                  <Route path="/badge" component={BadgePage} />
                  <Route path="/swarmmap" component={SwarmMapPage} />
                  <Route path="/partner" component={PartnerPortalPage} />
                  <Route
                    path="/partner-onboarding"
                    component={PartnerOnboardingPage}
                  />
                  <Route path="/eqa" component={EQAPage} />
                  <Route path="/pulse" component={PulsePage} />
                  <Route path="/status" component={StatusPage} />
                  <Route path="/support" component={SupportPage} />
                  <Route component={NotFound} />
                </Switch>
              </Suspense>
            </ErrorBoundary>
          </Layout>
        </Protected>
      </Route>
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/dashboard`}
      signUpFallbackRedirectUrl={`${basePath}/onboarding`}
      localization={{
        signIn: {
          start: {
            title: "Welcome to Agent-Sentinel",
            subtitle: "Sign in to access the audit ledger",
          },
        },
        signUp: {
          start: {
            title: "Create your Sentinel account",
            subtitle: "Email or social login — verified, audit-grade",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Router />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  // ── Global Scaling Reset (Operator brief §3) ──
  useEffect(() => {
    try {
      (document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = "1.0";
      (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom = "1.0";
    } catch {
      // older browsers without `zoom` support — silently no-op.
    }
  }, []);

  return (
    <ThemeProvider attribute="class" forcedTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <WsProvider>
          <ForensicProvider>
            <WouterRouter base={basePath}>
              <ClerkProviderWithRoutes />
            </WouterRouter>
            <Toaster />
          </ForensicProvider>
        </WsProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
