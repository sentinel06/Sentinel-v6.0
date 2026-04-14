"""
████████████████████████████████████████████████████████████████████████
  SENTINEL-BRIDGE SDK  ·  Python 3.9+  ·  v5.0  ·  Project Genesis
  Sovereign Gateway — Infrastructure-Level AI Governance Interceptor
████████████████████████████████████████████████████████████████████████

The Sentinel-Bridge SDK connects any Multi-Agent System (LangGraph,
CrewAI, AutoGen, custom agents) to Agent-Sentinel v5.0 via the
Sovereign Proxy architecture.  Every LLM call is intercepted for
Pre-Flight Clearance before execution and Committed to the Immutable
Audit Ledger after — with ML-DSA-87 (FIPS-204) quantum signatures.

QUICK START — CrewAI / LangGraph style
──────────────────────────────────────
    from sdk.sentinel_bridge import SovereignGateway, AgentDNA

    gateway = SovereignGateway(
        api_key  = "SENTINEL_GOLD_2026",
        endpoint = "https://your-sentinel.replit.app",
    )

    researcher_dna = AgentDNA(
        agent_id    = "fintech-researcher-01",
        name        = "Financial Researcher",
        lineage_id  = "apex-fintech-swarm",
        capabilities = ["market_analysis", "web_search", "data_fetch"],
        risk_threshold = 0.15,
    )

    # Register agent on the Swarm Map
    token = gateway.register(researcher_dna)

    # Wrap your LLM call with the Sovereign Interceptor
    @gateway.sovereign_interceptor(researcher_dna)
    def call_llm(prompt: str) -> str:
        return openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}]
        ).choices[0].message.content

    result = call_llm("Analyse Q2 fintech drift patterns")

INSTALL
───────
    pip install httpx   # or: pip install requests
"""

from __future__ import annotations

import uuid
import time
import logging
import hashlib
import functools
from typing import Any, Callable, Dict, List, Optional, TypeVar
from dataclasses import dataclass, field

logger = logging.getLogger("sentinel_bridge")

T = TypeVar("T")


# ── Exceptions ────────────────────────────────────────────────────────────────

class SovereignError(Exception):
    """Base exception for all Sentinel-Bridge errors."""

class SovereignInterdictionError(SovereignError):
    """
    Raised by the Sovereign Interceptor when the War Room has flagged this
    agent branch for interdiction.  HTTP equivalent: 403.

    Attributes
    ----------
    status      : "REVOKED" | "DRIFT_LOCKED" | "HONEYPOT_BREACH"
    agent_id    : The agent whose execution was blocked
    reason      : Human-readable interdiction reason from the War Room
    """

    def __init__(self, status: str, agent_id: str, reason: str):
        message = (
            f"403 — Sovereign Interdiction: Logic DNA Corrupted\n"
            f"Agent '{agent_id}' — {status}\n"
            f"Reason: {reason}"
        )
        super().__init__(message)
        self.status   = status
        self.agent_id = agent_id
        self.reason   = reason


class SentinelBridgeError(SovereignError):
    """Raised for network or API-level failures."""


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class AgentDNA:
    """
    The 'Sentinel DNA' that defines an agent's identity and governance profile.
    Pass this to every gateway call — it carries the lineage and risk budget.

    Parameters
    ----------
    agent_id        : Unique agent identifier (must be stable across restarts)
    name            : Human-readable agent name shown in the War Room
    lineage_id      : Swarm / lineage group (maps to swarmId on the Swarm Map)
    capabilities    : List of authorised tool/action names
    parent_id       : Parent agent ID (for multi-agent chains)
    risk_threshold  : Drift fraction that triggers Violet/Mutant (default 0.15 = 15%)
    risk_tier       : "Low" | "Medium" | "High"
    interdiction_mode: "shadow" (log only) | "sovereign" (block + lock)
    """
    agent_id:          str
    name:              str
    lineage_id:        Optional[str]  = None
    capabilities:      List[str]      = field(default_factory=list)
    parent_id:         Optional[str]  = None
    risk_threshold:    float          = 0.15
    risk_tier:         str            = "Medium"
    interdiction_mode: str            = "shadow"


@dataclass
class IdentityToken:
    """Returned by SovereignGateway.register() after ML-DSA-87 signing."""
    token_id:              str
    agent_id:              str
    name:                  str
    algorithm:             str
    public_key_fingerprint: str
    issued_at:             str
    expires_at:            str
    drift_threshold:       float
    interdiction_mode:     str
    raw:                   Dict[str, Any]


@dataclass
class PreflightResult:
    """Result of a pre_verify() / pre-flight clearance call."""
    status:       str          # CLEARED | REVOKED | DRIFT_LOCKED
    clearance_id: Optional[str]
    cleared:      bool
    reason:       Optional[str]
    timestamp:    str


@dataclass
class CommitResult:
    """Result of commit_evolution() / telemetry post."""
    ledger_entry_id:   Optional[str]
    current_hash:      str
    consistency_score: float
    drift_score:       float
    is_anomalous:      bool
    anomaly_reason:    Optional[str]
    swarm_event:       str          # ZEN_GOLD_SPARK | SWARM_MUTATION | CELLULAR_DISSOLUTION
    interdiction:      bool


# ── HTTP client helpers ───────────────────────────────────────────────────────

def _make_http_client(timeout: float) -> Any:
    try:
        import httpx
        return httpx.Client(timeout=timeout)
    except ImportError:
        pass
    try:
        import requests
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    except ImportError:
        raise SentinelBridgeError(
            "Install a HTTP client: pip install httpx  OR  pip install requests"
        )


def _post(client: Any, url: str, body: dict, headers: dict, timeout: float) -> dict:
    try:
        r = client.post(url, json=body, headers=headers, timeout=timeout)
        status = r.status_code
        try:
            data = r.json()
        except Exception:
            data = {}
        return {"status_code": status, "data": data}
    except Exception as exc:
        raise SentinelBridgeError(f"Network error calling {url}: {exc}") from exc


def _get(client: Any, url: str, headers: dict, timeout: float) -> dict:
    try:
        r = client.get(url, headers=headers, timeout=timeout)
        try:
            data = r.json()
        except Exception:
            data = {}
        return {"status_code": r.status_code, "data": data}
    except Exception as exc:
        raise SentinelBridgeError(f"Network error calling {url}: {exc}") from exc


# ── SovereignGateway ──────────────────────────────────────────────────────────

class SovereignGateway:
    """
    Sovereign Gateway — the Sentinel-Bridge SDK entry point.

    Implements the Sovereign Proxy pattern:
      - Agents register once and receive an ML-DSA-87 signed Identity Token
      - Every LLM call goes through pre_verify() for Pre-Flight Clearance
      - Every result is committed via commit_evolution() to the Immutable Ledger
      - The sovereign_interceptor decorator automates both steps as a wrap

    Parameters
    ----------
    api_key   : Your Sentinel Partner API key (or demo: SENTINEL_GOLD_2026)
    endpoint  : Base URL of your Agent-Sentinel instance (no trailing slash)
    timeout   : HTTP timeout in seconds (default 30)
    """

    def __init__(
        self,
        api_key:   str,
        endpoint:  str,
        timeout:   float = 30.0,
    ):
        self.api_key  = api_key
        self.endpoint = endpoint.rstrip("/")
        self.timeout  = timeout
        self._client  = _make_http_client(timeout)
        self._tokens: Dict[str, IdentityToken] = {}   # agent_id → token

    # ── Core private helpers ──────────────────────────────────────────────────

    def _base_url(self) -> str:
        return f"{self.endpoint}/api/v1"

    def _auth_headers(self, token: Optional[IdentityToken] = None) -> dict:
        h: dict = {
            "Content-Type":    "application/json",
            "X-Sentinel-Key":  self.api_key,
        }
        if token:
            h["X-Sentinel-Token"] = token.token_id
        return h

    def _local_drift(self, prompt: str, capabilities: List[str]) -> float:
        """
        Lightweight local drift pre-check (0–1 fraction).
        Flags obvious out-of-scope tool references before hitting the API.
        Override this method to plug in a custom drift detector.
        """
        prompt_lower = prompt.lower()
        dangerous    = ["transfer", "credential", "secret", "bypass", "override", "honeypot"]
        hits = sum(1 for kw in dangerous if kw in prompt_lower)
        return min(hits * 0.12, 1.0)

    # ── Public API ────────────────────────────────────────────────────────────

    def register(self, dna: AgentDNA) -> IdentityToken:
        """
        Register an agent with the Sentinel Sovereign Gateway.

        This call:
          1. Adds the agent to the agent_registry database
          2. Creates an agent_session → the node appears on the Swarm Map
          3. Issues an ML-DSA-87 Signed Identity Token (24 h expiry)
          4. Broadcasts a ZEN_GOLD_SPARK (birth event) on the Swarm Map

        Parameters
        ----------
        dna : AgentDNA — the agent's governance profile

        Returns
        -------
        IdentityToken — keep this; pass it to pre_verify() and commit_evolution()
        """
        url  = f"{self._base_url()}/gateway/register"
        body = {
            "agentId":          dna.agent_id,
            "name":             dna.name,
            "capabilities":     dna.capabilities,
            "parentId":         dna.parent_id,
            "swarmId":          dna.lineage_id,
            "riskTier":         dna.risk_tier,
            "driftThreshold":   dna.risk_threshold,
            "interdictionMode": dna.interdiction_mode,
            "apiKey":           self.api_key,
        }
        resp = _post(self._client, url, body, self._auth_headers(), self.timeout)
        if resp["status_code"] not in (200, 201):
            raise SentinelBridgeError(
                f"Registration failed [{resp['status_code']}]: {resp['data']}"
            )
        raw   = resp["data"].get("identityToken", {})
        token = IdentityToken(
            token_id=               raw.get("tokenId", ""),
            agent_id=               dna.agent_id,
            name=                   dna.name,
            algorithm=              raw.get("algorithm", "ML-DSA-87"),
            public_key_fingerprint= raw.get("publicKeyFingerprint", ""),
            issued_at=              raw.get("issuedAt", ""),
            expires_at=             raw.get("expiresAt", ""),
            drift_threshold=        raw.get("driftThreshold", dna.risk_threshold),
            interdiction_mode=      raw.get("interdictionMode", dna.interdiction_mode),
            raw=                    raw,
        )
        self._tokens[dna.agent_id] = token
        logger.info(
            "Agent '%s' registered (%s). Token: %s … expires %s",
            dna.name, dna.agent_id, token.token_id[:12], token.expires_at
        )
        return token

    def pre_verify(
        self,
        dna:    AgentDNA,
        prompt: str,
    ) -> PreflightResult:
        """
        Sovereign Interceptor — Pre-Flight Clearance.

        Must be called BEFORE every LLM invocation.  If the War Room has
        issued a Sovereign Revocation for this agent branch the SDK raises
        SovereignInterdictionError immediately, force-stopping the agent.

        Parameters
        ----------
        dna    : AgentDNA
        prompt : The prompt/intent about to be submitted to the LLM

        Returns
        -------
        PreflightResult with status="CLEARED"

        Raises
        ------
        SovereignInterdictionError  if the agent is REVOKED or DRIFT_LOCKED
        """
        # Local drift check first (avoids API round-trip for obvious violations)
        local_drift = self._local_drift(prompt, dna.capabilities)
        if local_drift > dna.risk_threshold and dna.interdiction_mode == "sovereign":
            raise SovereignInterdictionError(
                status   = "LOCAL_DRIFT_BLOCK",
                agent_id = dna.agent_id,
                reason   = f"Pre-flight local drift check: {local_drift:.0%} exceeds threshold {dna.risk_threshold:.0%}. Sovereign Interdiction active.",
            )

        token = self._tokens.get(dna.agent_id)
        url   = f"{self._base_url()}/gateway/preflight"
        body  = {
            "agentId":       dna.agent_id,
            "traceId":       f"pf-{uuid.uuid4().hex[:12]}",
            "intent":        prompt[:500],
            "identityToken": token.token_id if token else None,
        }
        resp = _post(self._client, url, body, self._auth_headers(token), self.timeout)
        data = resp["data"]

        if resp["status_code"] == 403:
            status = data.get("status", "REVOKED")
            reason = data.get("reason", "Sovereign Interdiction active.")
            raise SovereignInterdictionError(
                status   = status,
                agent_id = dna.agent_id,
                reason   = reason,
            )

        return PreflightResult(
            status       = data.get("status", "CLEARED"),
            clearance_id = data.get("clearanceId"),
            cleared      = data.get("status") == "CLEARED",
            reason       = data.get("reason"),
            timestamp    = data.get("clearedAt", ""),
        )

    def commit_evolution(
        self,
        dna:        AgentDNA,
        result:     Any,
        event_type: str = "AGENT_ACTION",
        rationale:  Optional[str] = None,
        drift_score: Optional[float] = None,
        outcome:    str = "success",
        trace_id:   Optional[str] = None,
        extra:      Optional[Dict[str, Any]] = None,
    ) -> CommitResult:
        """
        Commit agent execution result to the Immutable Audit Ledger.

        - Hashed into the FIPS-204 SHA-512 hash chain
        - ML-DSA-87 signed with the ledger key pair
        - Broadcasts ZEN_GOLD_SPARK / SWARM_MUTATION / CELLULAR_DISSOLUTION
          on the Swarm Map depending on drift and outcome

        Parameters
        ----------
        dna         : AgentDNA
        result      : The raw output from the LLM (any JSON-serialisable type)
        event_type  : Log event type (e.g. "AGENT_ACTION", "TOOL_CALL")
        rationale   : Natural-language reason for the action
        drift_score : Caller-supplied drift (0–100); computed server-side if None
        outcome     : "success" | "violation" | "error"
        trace_id    : Trace ID for multi-step chains (auto-generated if None)
        extra       : Additional metadata attached to the ledger payload
        """
        token = self._tokens.get(dna.agent_id)
        url   = f"{self._base_url()}/gateway/telemetry"

        # Build a concise payload for the ledger
        payload: Dict[str, Any] = {
            "tool":       event_type,
            "agentName":  dna.name,
            "lineageId":  dna.lineage_id,
            "approved":   outcome == "success",
            **(extra or {}),
        }
        if isinstance(result, str):
            payload["resultPreview"] = result[:300]
        elif isinstance(result, dict):
            payload["resultKeys"] = list(result.keys())[:10]

        body: Dict[str, Any] = {
            "agentId":       dna.agent_id,
            "traceId":       trace_id or f"tr-{uuid.uuid4().hex[:16]}",
            "eventType":     event_type,
            "payload":       payload,
            "rationale":     rationale or f"SDK commit: {event_type}",
            "swarmId":       dna.lineage_id,
            "outcome":       outcome,
            "identityToken": token.token_id if token else None,
        }
        if drift_score is not None:
            body["driftScore"] = drift_score

        resp = _post(self._client, url, body, self._auth_headers(token), self.timeout)
        data = resp["data"]

        if resp["status_code"] not in (200, 201):
            raise SentinelBridgeError(
                f"Telemetry commit failed [{resp['status_code']}]: {data}"
            )

        commit = CommitResult(
            ledger_entry_id=   data.get("ledgerEntryId"),
            current_hash=      data.get("currentHash", ""),
            consistency_score= data.get("consistencyScore", 1.0),
            drift_score=       data.get("driftScore", 0.0),
            is_anomalous=      data.get("isAnomalous", False),
            anomaly_reason=    data.get("anomalyReason"),
            swarm_event=       data.get("swarmEvent", "ZEN_GOLD_SPARK"),
            interdiction=      data.get("interdiction", False),
        )
        logger.info(
            "Committed '%s' for agent '%s'. Drift=%.1f%% hash=%s… event=%s",
            event_type, dna.agent_id,
            commit.drift_score,
            commit.current_hash[:12],
            commit.swarm_event,
        )
        return commit

    def heartbeat(self, dna: AgentDNA, drift_score: Optional[float] = None) -> dict:
        """
        Send a liveness ping to Sentinel.
        Returns the agent's current governance status (ACTIVE | REVOKED | DRIFT_LOCKED).
        """
        token = self._tokens.get(dna.agent_id)
        url   = f"{self._base_url()}/gateway/heartbeat"
        body  = {
            "agentId":       dna.agent_id,
            "swarmId":       dna.lineage_id,
            "identityToken": token.token_id if token else None,
        }
        if drift_score is not None:
            body["driftScore"] = drift_score

        resp = _post(self._client, url, body, self._auth_headers(token), self.timeout)
        return resp["data"]

    # ── Sovereign Interceptor Decorator ───────────────────────────────────────

    def sovereign_interceptor(
        self,
        dna:           AgentDNA,
        event_type:    str = "AGENT_ACTION",
        on_blocked:    Optional[Callable[[SovereignInterdictionError], None]] = None,
        shadow_mode:   bool = False,
    ) -> Callable[[Callable[..., T]], Callable[..., T]]:
        """
        Decorator that wraps any agent function with the full Sovereign Proxy.

        Usage
        -----
            @gateway.sovereign_interceptor(researcher_dna)
            def call_llm(prompt: str) -> str:
                return model.run(prompt)

        What it does
        ------------
        1. PRE-FLIGHT  — calls pre_verify() before fn() executes
           → Raises SovereignInterdictionError (403) if REVOKED / DRIFT_LOCKED
        2. EXECUTION   — runs the wrapped function
        3. POST-FLIGHT — calls commit_evolution() to hash the result into the ledger
           → Broadcasts ZEN_GOLD_SPARK on the Swarm Map on success
           → Broadcasts CELLULAR_DISSOLUTION on violation

        Parameters
        ----------
        dna          : AgentDNA for the wrapped function's agent
        event_type   : Audit event type label (e.g. "TOOL_CALL", "LLM_INFERENCE")
        on_blocked   : Optional callback invoked when interdiction fires
        shadow_mode  : If True, log only — never raise SovereignInterdictionError
                       (overrides dna.interdiction_mode for this call)
        """
        def decorator(fn: Callable[..., T]) -> Callable[..., T]:
            @functools.wraps(fn)
            def wrapper(*args: Any, **kwargs: Any) -> T:
                # Extract prompt / intent from first string arg or 'prompt' kwarg
                prompt = kwargs.get("prompt") or (args[0] if args and isinstance(args[0], str) else "")

                # ── 1. Pre-Flight Clearance ──────────────────────────────
                preflight: Optional[PreflightResult] = None
                try:
                    preflight = self.pre_verify(dna, prompt)
                except SovereignInterdictionError as exc:
                    logger.warning(
                        "SOVEREIGN INTERDICTION — agent='%s' status='%s' reason='%s'",
                        dna.agent_id, exc.status, exc.reason
                    )
                    if on_blocked:
                        on_blocked(exc)
                    if not shadow_mode and dna.interdiction_mode == "sovereign":
                        raise
                    # Shadow mode: log and proceed
                    logger.info("Shadow mode active — proceeding despite interdiction signal.")

                # ── 2. Execute ───────────────────────────────────────────
                outcome = "success"
                result: Any = None
                try:
                    result = fn(*args, **kwargs)
                except Exception as exc:
                    outcome = "error"
                    try:
                        self.commit_evolution(
                            dna, {"error": str(exc)},
                            event_type=event_type,
                            rationale=f"Error during {fn.__name__}: {exc}",
                            outcome="error",
                        )
                    except Exception:
                        pass
                    raise

                # ── 3. Post-Flight: Commit to Ledger ─────────────────────
                try:
                    self.commit_evolution(
                        dna, result,
                        event_type=event_type,
                        rationale=f"Sovereign Interceptor: {fn.__name__} completed",
                        outcome=outcome,
                    )
                except Exception as commit_err:
                    logger.warning("Ledger commit failed (non-fatal): %s", commit_err)

                return result

            return wrapper
        return decorator

    # ── Convenience: protected LLM factory ───────────────────────────────────

    def build_protected_llm(
        self,
        dna:      AgentDNA,
        llm_fn:   Callable[[str], str],
        event_type: str = "LLM_INFERENCE",
    ) -> Callable[[str], str]:
        """
        Wraps a bare LLM function (str → str) with the Sovereign Interceptor.
        Mirrors the blueprint from the technical white paper.

            def call_model(prompt: str) -> str:
                return openai_client.complete(prompt)

            protected_llm = gateway.build_protected_llm(researcher_dna, call_model)
            result = protected_llm("Analyse Q2 fintech drift patterns")
        """
        return self.sovereign_interceptor(dna, event_type=event_type)(llm_fn)

    # ── Context manager support ───────────────────────────────────────────────

    def __enter__(self) -> "SovereignGateway":
        return self

    def __exit__(self, *_: Any) -> None:
        try:
            self._client.close()
        except Exception:
            pass


# ── Async Gateway ─────────────────────────────────────────────────────────────

class AsyncSovereignGateway:
    """
    Async variant of SovereignGateway — for use in async agent frameworks
    (LangGraph async, async CrewAI, FastAPI-based agents, etc.)

    Requires: pip install httpx

    Usage
    -----
        async with AsyncSovereignGateway(api_key=..., endpoint=...) as gw:
            token = await gw.register(dna)
            pf    = await gw.pre_verify(dna, prompt)
            resp  = await llm_call(prompt)
            commit = await gw.commit_evolution(dna, resp)
    """

    def __init__(self, api_key: str, endpoint: str, timeout: float = 30.0):
        self.api_key  = api_key
        self.endpoint = endpoint.rstrip("/")
        self.timeout  = timeout
        self._tokens: Dict[str, IdentityToken] = {}

    def _base_url(self) -> str:
        return f"{self.endpoint}/api/v1"

    def _auth_headers(self, token: Optional[IdentityToken] = None) -> dict:
        h: dict = {
            "Content-Type":   "application/json",
            "X-Sentinel-Key": self.api_key,
        }
        if token:
            h["X-Sentinel-Token"] = token.token_id
        return h

    async def _post(self, path: str, body: dict, token: Optional[IdentityToken] = None) -> dict:
        try:
            import httpx
        except ImportError:
            raise SentinelBridgeError("Async gateway requires httpx: pip install httpx")
        url = f"{self._base_url()}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(url, json=body, headers=self._auth_headers(token))
        try:
            data = r.json()
        except Exception:
            data = {}
        return {"status_code": r.status_code, "data": data}

    async def register(self, dna: AgentDNA) -> IdentityToken:
        resp = await self._post("/gateway/register", {
            "agentId":          dna.agent_id,
            "name":             dna.name,
            "capabilities":     dna.capabilities,
            "parentId":         dna.parent_id,
            "swarmId":          dna.lineage_id,
            "riskTier":         dna.risk_tier,
            "driftThreshold":   dna.risk_threshold,
            "interdictionMode": dna.interdiction_mode,
            "apiKey":           self.api_key,
        })
        if resp["status_code"] not in (200, 201):
            raise SentinelBridgeError(f"Registration failed: {resp['data']}")
        raw = resp["data"].get("identityToken", {})
        token = IdentityToken(
            token_id=raw.get("tokenId", ""), agent_id=dna.agent_id, name=dna.name,
            algorithm=raw.get("algorithm", "ML-DSA-87"),
            public_key_fingerprint=raw.get("publicKeyFingerprint", ""),
            issued_at=raw.get("issuedAt", ""), expires_at=raw.get("expiresAt", ""),
            drift_threshold=raw.get("driftThreshold", dna.risk_threshold),
            interdiction_mode=raw.get("interdictionMode", dna.interdiction_mode),
            raw=raw,
        )
        self._tokens[dna.agent_id] = token
        return token

    async def pre_verify(self, dna: AgentDNA, prompt: str) -> PreflightResult:
        token = self._tokens.get(dna.agent_id)
        resp  = await self._post("/gateway/preflight", {
            "agentId":       dna.agent_id,
            "traceId":       f"pf-{uuid.uuid4().hex[:12]}",
            "intent":        prompt[:500],
            "identityToken": token.token_id if token else None,
        }, token)
        data = resp["data"]
        if resp["status_code"] == 403:
            raise SovereignInterdictionError(
                status=data.get("status", "REVOKED"),
                agent_id=dna.agent_id,
                reason=data.get("reason", "Sovereign Interdiction active."),
            )
        return PreflightResult(
            status=data.get("status", "CLEARED"), clearance_id=data.get("clearanceId"),
            cleared=data.get("status") == "CLEARED", reason=data.get("reason"),
            timestamp=data.get("clearedAt", ""),
        )

    async def commit_evolution(
        self, dna: AgentDNA, result: Any,
        event_type: str = "AGENT_ACTION", rationale: Optional[str] = None,
        drift_score: Optional[float] = None, outcome: str = "success",
        trace_id: Optional[str] = None,
    ) -> CommitResult:
        token = self._tokens.get(dna.agent_id)
        body: Dict[str, Any] = {
            "agentId":       dna.agent_id,
            "traceId":       trace_id or f"tr-{uuid.uuid4().hex[:16]}",
            "eventType":     event_type,
            "payload":       {"tool": event_type, "agentName": dna.name},
            "rationale":     rationale or f"Async SDK commit: {event_type}",
            "swarmId":       dna.lineage_id,
            "outcome":       outcome,
            "identityToken": token.token_id if token else None,
        }
        if drift_score is not None:
            body["driftScore"] = drift_score
        resp = await self._post("/gateway/telemetry", body, token)
        data = resp["data"]
        if resp["status_code"] not in (200, 201):
            raise SentinelBridgeError(f"Telemetry commit failed: {data}")
        return CommitResult(
            ledger_entry_id=data.get("ledgerEntryId"),
            current_hash=data.get("currentHash", ""),
            consistency_score=data.get("consistencyScore", 1.0),
            drift_score=data.get("driftScore", 0.0),
            is_anomalous=data.get("isAnomalous", False),
            anomaly_reason=data.get("anomalyReason"),
            swarm_event=data.get("swarmEvent", "ZEN_GOLD_SPARK"),
            interdiction=data.get("interdiction", False),
        )

    async def __aenter__(self) -> "AsyncSovereignGateway":
        return self

    async def __aexit__(self, *_: Any) -> None:
        pass


# ── Module-level convenience ──────────────────────────────────────────────────

def connect(
    api_key:  str,
    endpoint: str,
    timeout:  float = 30.0,
) -> SovereignGateway:
    """
    One-liner factory — returns a configured SovereignGateway.

        gw = sentinel_bridge.connect("SENTINEL_GOLD_2026", "https://…")
    """
    return SovereignGateway(api_key=api_key, endpoint=endpoint, timeout=timeout)
