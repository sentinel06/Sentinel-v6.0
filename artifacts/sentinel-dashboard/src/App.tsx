import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { ForensicProvider } from "@/contexts/ForensicContext";

// Pages
import DashboardPage from "@/pages/dashboard";
import TracesPage from "@/pages/traces";
import AgentsPage from "@/pages/agents";
import CompliancePage from "@/pages/compliance";
import IntegrityPage from "@/pages/integrity";
import WarRoomPage from "@/pages/warroom";
import TopologyPage from "@/pages/topology";
import BadgePage from "@/pages/badge";
import SwarmMapPage from "@/pages/swarmmap";
import PartnerPortalPage from "@/pages/partnerportal";
import PartnerOnboardingPage from "@/pages/partneronboarding";
import EQAPage from "@/pages/eqa";
import PulsePage from "@/pages/pulse";
import StatusPage from "@/pages/status";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
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
        <Route path="/partner-onboarding" component={PartnerOnboardingPage} />
        <Route path="/eqa" component={EQAPage} />
        <Route path="/pulse" component={PulsePage} />
        <Route path="/status" component={StatusPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ForensicProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </ForensicProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
