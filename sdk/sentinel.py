"""
████████████████████████████████████████████████████
  AGENT-SENTINEL SDK  ·  Python 3.9+
  EU AI Act Art. 12/14 Traceability Wrapper
████████████████████████████████████████████████████

Drop-in wrapper for LLM agent calls (OpenAI, Anthropic, etc.).
Every action is pre-authorized and every result is immutably
logged with SHA-256 hash chaining.

QUICK START
───────────
    from sdk.sentinel import SentinelClient

    sentinel = SentinelClient(
        base_url="https://your-sentinel.replit.app/api/v1",
        agent_id="my-gpt-agent",
    )

    # Wrap any LLM call with governance:
    result = sentinel.governed(
        action_type="financial_transfer",
        intent="Transfer Q1 budget to vendor account",
        fn=lambda: my_llm.run("transfer $5000 to acct-9847"),
    )

ASYNC USAGE
───────────
    import asyncio
    from sdk.sentinel import AsyncSentinelClient

    async def main():
        sentinel = AsyncSentinelClient(base_url=..., agent_id=...)
        result = await sentinel.governed("read", "Fetch report", my_async_fn)

INSTALL
───────
    pip install httpx   # only external dependency
    # or: pip install requests  (sync client only)
"""

from __future__ import annotations

import uuid
import time
import logging
from typing import Any, Callable, Optional, TypeVar
from dataclasses import dataclass, field

logger = logging.getLogger("sentinel")

T = TypeVar("T")


# ── Exceptions ────────────────────────────────────────────────────────────

class SentinelError(Exception):
    """Base class for all Sentinel SDK errors."""

class SentinelBlockedError(SentinelError):
    """Raised when an action is blocked by the circuit breaker."""

    def __init__(self, block_reason: str, message: str, request_id: str):
        super().__init__(message)
        self.block_reason = block_reason
        self.request_id = request_id


# ── Data classes ─────────────────────────────────────────────────────────

@dataclass
class AuthorizeResult:
    status: str          # AUTHORIZED | PENDING_APPROVAL | AUTO_BLOCKED | BLOCKED | HONEYPOT_BREACH
    request_id: str
    session_health_score: float = 1.0
    cluster_health_score: float = 1.0
    reason: Optional[str] = None
    is_high_risk: bool = False


@dataclass
class LogResult:
    id: str
    trace_id: str
    current_hash: str
    consistency_score: float
    is_anomalous: bool
    anomaly_reason: Optional[str] = None


# ── Sync Client ───────────────────────────────────────────────────────────

class SentinelClient:
    """
    Synchronous Sentinel client. Uses `requests` if available, else `httpx`.

    Args:
        base_url:        Full URL of Sentinel API (e.g. https://…/api/v1)
        agent_id:        Unique name for this agent instance
        trace_id:        Session trace ID — auto-generated if omitted
        parent_trace_id: For multi-agent chains (links to parent trace)
        timeout:         Request timeout in seconds (default: 30)
    """

    def __init__(
        self,
        base_url: str,
        agent_id: str,
        trace_id: Optional[str] = None,
        parent_trace_id: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self.trace_id = trace_id or str(uuid.uuid4())
        self.parent_trace_id = parent_trace_id
        self.timeout = timeout
        self._session = self._make_session()

    def _make_session(self) -> Any:
        try:
            import requests
            s = requests.Session()
            s.headers.update({"Content-Type": "application/json"})
            return s
        except ImportError:
            pass
        try:
            import httpx
            return httpx.Client(
                headers={"Content-Type": "application/json"},
                timeout=self.timeout,
            )
        except ImportError:
            raise SentinelError(
                "Install either 'requests' or 'httpx': pip install requests"
            )

    def _post(self, path: str, body: dict) -> dict:
        url = f"{self.base_url}{path}"
        try:
            r = self._session.post(url, json=body, timeout=self.timeout)
        except Exception as e:
            raise SentinelError(f"Network error calling {url}: {e}") from e

        data = r.json() if hasattr(r, "json") and callable(r.json) else {}
        if r.status_code not in (200, 201, 202, 403):
            raise SentinelError(
                f"Sentinel API error {r.status_code}: {data}"
            )
        return data

    # ── Core API ──────────────────────────────────────────────────────────

    def authorize(
        self,
        action_type: str,
        intent: str,
        proposed_action: str,
    ) -> AuthorizeResult:
        """
        Request pre-execution authorization from the Sentinel circuit breaker.
        Blocks until a human approves/denies (if PENDING).
        """
        data = self._post("/authorize", {
            "agentId": self.agent_id,
            "traceId": self.trace_id,
            "parentTraceId": self.parent_trace_id,
            "intent": intent,
            "proposedAction": proposed_action,
            "actionType": action_type,
        })

        result = AuthorizeResult(
            status=data.get("status", "BLOCKED"),
            request_id=data.get("requestId", ""),
            session_health_score=data.get("sessionHealthScore", 1.0) or 1.0,
            cluster_health_score=data.get("clusterHealthScore", 1.0) or 1.0,
            reason=data.get("reason"),
            is_high_risk=data.get("isHighRisk", False),
        )

        if result.status == "PENDING_APPROVAL":
            result = self._poll_until_resolved(result.request_id)

        return result

    def log(
        self,
        event_type: str,
        payload: dict,
        rationale: Optional[str] = None,
    ) -> LogResult:
        """Write an immutable audit entry to the Sentinel ledger."""
        data = self._post("/log", {
            "agentId": self.agent_id,
            "traceId": self.trace_id,
            "parentTraceId": self.parent_trace_id,
            "eventType": event_type,
            "payload": payload,
            "rationale": rationale,
        })
        return LogResult(
            id=data.get("id", ""),
            trace_id=data.get("traceId", self.trace_id),
            current_hash=data.get("currentHash", ""),
            consistency_score=data.get("consistencyScore", 1.0),
            is_anomalous=data.get("isAnomalous", False),
            anomaly_reason=data.get("anomalyReason"),
        )

    def simulate(
        self,
        event_type: str,
        payload: dict,
        rationale: str,
    ) -> dict:
        """
        Dry-run consistency scoring without writing to the ledger.
        Returns {"consistencyScore": float, "reasons": [...], "isAnomalous": bool}
        """
        return self._post("/simulate", {
            "agentId": self.agent_id,
            "traceId": self.trace_id,
            "eventType": event_type,
            "payload": payload,
            "rationale": rationale,
        })

    # ── High-level wrapper ────────────────────────────────────────────────

    def governed(
        self,
        action_type: str,
        intent: str,
        fn: Callable[[], T],
        rationale: Optional[str] = None,
        on_pending: Optional[Callable[[str], None]] = None,
        on_blocked: Optional[Callable[[str], None]] = None,
    ) -> T:
        """
        Full governance wrapper for any LLM call.

        1. Calls /v1/authorize — blocks on PENDING until human approval
        2. Runs fn() if authorized
        3. Logs result to the immutable ledger
        4. Returns the result

        Raises SentinelBlockedError if blocked.

        Example:
            answer = sentinel.governed(
                action_type="read",
                intent="Summarize Q1 financials",
                fn=lambda: openai.chat.completions.create(...),
            )
        """
        proposed_action = f"{action_type}: {intent}"
        auth = self.authorize(action_type, intent, proposed_action)

        if auth.status == "PENDING_APPROVAL":
            if on_pending:
                on_pending(auth.request_id)
            raise SentinelBlockedError(
                "PENDING_APPROVAL",
                "Authorization is pending human approval",
                auth.request_id,
            )

        if auth.status in ("AUTO_BLOCKED", "BLOCKED", "HONEYPOT_BREACH"):
            reason = auth.reason or "Blocked by Sentinel circuit breaker"
            if on_blocked:
                on_blocked(reason)
            raise SentinelBlockedError(auth.status, reason, auth.request_id)

        # Execute
        try:
            result = fn()
        except Exception as e:
            self.log("Error", {
                "actionType": action_type,
                "intent": intent,
                "error": str(e),
                "authRequestId": auth.request_id,
            }, rationale or intent)
            raise

        # Log success
        log_payload: dict = {
            "actionType": action_type,
            "authRequestId": auth.request_id,
            "sessionHealthScore": auth.session_health_score,
            "clusterHealthScore": auth.cluster_health_score,
        }
        if isinstance(result, str):
            log_payload["resultPreview"] = result[:500]
        elif isinstance(result, dict):
            log_payload["resultKeys"] = list(result.keys())

        self.log("Action", log_payload, rationale or intent)
        return result

    # ── Multi-agent chain ─────────────────────────────────────────────────

    def spawn_child(
        self,
        child_agent_id: str,
        child_trace_id: Optional[str] = None,
    ) -> "SentinelClient":
        """
        Create a child client that links to this client's trace.
        Child logs appear as downstream nodes in the Topology view.

        Example:
            planner = SentinelClient(base_url=..., agent_id="planner")
            writer = planner.spawn_child("writer")
        """
        return SentinelClient(
            base_url=self.base_url,
            agent_id=child_agent_id,
            trace_id=child_trace_id or str(uuid.uuid4()),
            parent_trace_id=self.trace_id,
            timeout=self.timeout,
        )

    def _poll_until_resolved(
        self,
        request_id: str,
        max_wait_seconds: float = 300,
    ) -> AuthorizeResult:
        deadline = time.time() + max_wait_seconds
        while time.time() < deadline:
            try:
                url = f"{self.base_url}/authorize/{request_id}/status"
                r = self._session.get(url, timeout=self.timeout)
                data = r.json() if hasattr(r, "json") and callable(r.json) else {}
                status = data.get("status", "PENDING")
                if status and status != "PENDING":
                    return AuthorizeResult(
                        status=status,
                        request_id=request_id,
                        session_health_score=data.get("sessionHealthScore", 1.0) or 1.0,
                        cluster_health_score=data.get("clusterHealthScore", 1.0) or 1.0,
                        reason=data.get("reason"),
                    )
            except Exception:
                pass
            time.sleep(1)
        raise SentinelError("Authorization timed out waiting for human approval")


# ── Async Client ─────────────────────────────────────────────────────────

class AsyncSentinelClient:
    """
    Async version of SentinelClient. Requires `httpx` (pip install httpx).

    Example:
        import asyncio

        async def main():
            s = AsyncSentinelClient(base_url=..., agent_id="planner")
            result = await s.governed("read", "Fetch Q1 data", my_async_fn)

        asyncio.run(main())
    """

    def __init__(
        self,
        base_url: str,
        agent_id: str,
        trace_id: Optional[str] = None,
        parent_trace_id: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self.trace_id = trace_id or str(uuid.uuid4())
        self.parent_trace_id = parent_trace_id
        self.timeout = timeout

    async def _post(self, path: str, body: dict) -> dict:
        try:
            import httpx
        except ImportError:
            raise SentinelError("Async client requires httpx: pip install httpx")

        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(url, json=body)
        data = r.json()
        if r.status_code not in (200, 201, 202, 403):
            raise SentinelError(f"Sentinel API error {r.status_code}: {data}")
        return data

    async def authorize(self, action_type: str, intent: str, proposed_action: str) -> AuthorizeResult:
        data = await self._post("/authorize", {
            "agentId": self.agent_id,
            "traceId": self.trace_id,
            "parentTraceId": self.parent_trace_id,
            "intent": intent,
            "proposedAction": proposed_action,
            "actionType": action_type,
        })
        result = AuthorizeResult(
            status=data.get("status", "BLOCKED"),
            request_id=data.get("requestId", ""),
            session_health_score=data.get("sessionHealthScore", 1.0) or 1.0,
            cluster_health_score=data.get("clusterHealthScore", 1.0) or 1.0,
            reason=data.get("reason"),
            is_high_risk=data.get("isHighRisk", False),
        )
        if result.status == "PENDING_APPROVAL":
            result = await self._poll_until_resolved(result.request_id)
        return result

    async def log(self, event_type: str, payload: dict, rationale: Optional[str] = None) -> LogResult:
        data = await self._post("/log", {
            "agentId": self.agent_id,
            "traceId": self.trace_id,
            "parentTraceId": self.parent_trace_id,
            "eventType": event_type,
            "payload": payload,
            "rationale": rationale,
        })
        return LogResult(
            id=data.get("id", ""),
            trace_id=data.get("traceId", self.trace_id),
            current_hash=data.get("currentHash", ""),
            consistency_score=data.get("consistencyScore", 1.0),
            is_anomalous=data.get("isAnomalous", False),
            anomaly_reason=data.get("anomalyReason"),
        )

    async def governed(
        self,
        action_type: str,
        intent: str,
        fn: Callable[[], Any],
        rationale: Optional[str] = None,
    ) -> Any:
        import asyncio
        proposed_action = f"{action_type}: {intent}"
        auth = await self.authorize(action_type, intent, proposed_action)

        if auth.status in ("PENDING_APPROVAL", "AUTO_BLOCKED", "BLOCKED", "HONEYPOT_BREACH"):
            raise SentinelBlockedError(
                auth.status,
                auth.reason or "Blocked by Sentinel",
                auth.request_id,
            )

        try:
            if asyncio.iscoroutinefunction(fn):
                result = await fn()
            else:
                result = fn()
        except Exception as e:
            await self.log("Error", {"error": str(e), "actionType": action_type}, rationale or intent)
            raise

        await self.log("Action", {
            "actionType": action_type,
            "authRequestId": auth.request_id,
            "sessionHealthScore": auth.session_health_score,
        }, rationale or intent)
        return result

    def spawn_child(self, child_agent_id: str, child_trace_id: Optional[str] = None) -> "AsyncSentinelClient":
        return AsyncSentinelClient(
            base_url=self.base_url,
            agent_id=child_agent_id,
            trace_id=child_trace_id or str(uuid.uuid4()),
            parent_trace_id=self.trace_id,
            timeout=self.timeout,
        )

    async def _poll_until_resolved(self, request_id: str, max_wait_seconds: float = 300) -> AuthorizeResult:
        import asyncio, httpx
        deadline = time.time() + max_wait_seconds
        while time.time() < deadline:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    r = await client.get(f"{self.base_url}/authorize/{request_id}/status")
                data = r.json()
                if data.get("status") and data["status"] != "PENDING":
                    return AuthorizeResult(
                        status=data["status"],
                        request_id=request_id,
                        session_health_score=data.get("sessionHealthScore", 1.0) or 1.0,
                        cluster_health_score=data.get("clusterHealthScore", 1.0) or 1.0,
                        reason=data.get("reason"),
                    )
            except Exception:
                pass
            await asyncio.sleep(1)
        raise SentinelError("Authorization timed out")
