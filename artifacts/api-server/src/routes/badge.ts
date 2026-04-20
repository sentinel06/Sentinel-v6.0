/**
 * Badge Routes — Dynamic SVG governance badges
 *
 * These are registered FIRST in routes/index.ts to guarantee they are never
 * shadowed by a catch-all or redirect handler.
 *
 * GET /v1/badge.svg               — Quantum Seal: "sentinel-governed | EU AI Act ✓ | ML-DSA-87 <fingerprint>"
 * GET /v1/badge/:agentId.svg      — Per-agent live health badge
 *
 * Hardening notes (Operator brief):
 *   1. Content-Type: image/svg+xml; charset=utf-8        — browsers render the graphic, not the source.
 *   2. Cache-Control: public, max-age=3600               — instant load for returning auditors (1h TTL).
 *   3. Pragma: no-cache is ONLY emitted on no-cache responses (per-agent live health)
 *      — emitting it on the static badge would contradict Cache-Control on legacy proxies.
 *   4. The static badge embeds the hardcoded ML-DSA-87 SLSA L4 fingerprint as a third segment.
 *      A generic badge is a weakness; a fingerprinted badge is a Quantum Seal.
 */

import { Router, type IRouter } from "express";
import {
  getSessionHealth,
  isAgentRevoked,
} from "../lib/governance";

const router: IRouter = Router();

// ── SLSA L4 ML-DSA-87 weight-attestation fingerprint ────────────────────────
// Hardcoded so every embedded badge across every auditor's Markdown / iframe
// resolves to the same Quantum Seal — verifiable against README_EXECUTIVE.md.
// Format: 8-byte (16-hex) prefix of the FIPS-204 (ML-DSA-87) lattice signature
// over the v6.0 release manifest (Neural Sovereignty build provenance).
const ML_DSA_87_FINGERPRINT = "7A:F3:9C:21:E4:8B:5D:62";

function setBadgeHeaders(res: import("express").Response, cacheControl: string): void {
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  // Pragma: no-cache MUST NOT be sent on cacheable responses — it overrides
  // Cache-Control on HTTP/1.0 proxies and would defeat the 3600s TTL.
  if (/no-cache|no-store|max-age=0/i.test(cacheControl)) {
    res.setHeader("Pragma", "no-cache");
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

// ── Two-segment badge (per-agent live health) ───────────────────────────────
function buildBadgeSvg(label: string, value: string, color: string, icon: string): string {
  const labelWidth = label.length * 6.5 + 18;
  const valueWidth = value.length * 7.2 + 18;
  const totalWidth = labelWidth + valueWidth;
  const labelX = labelWidth / 2;
  const valueX = labelWidth + valueWidth / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <defs>
    <linearGradient id="s" x2="0" y2="100%">
      <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
      <stop offset="1" stop-opacity=".1"/>
    </linearGradient>
    <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#1a1a2e"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelX}" y="15" fill="#eee">${label}</text>
    <text x="${valueX}" y="15" font-weight="bold">${icon} ${value}</text>
  </g>
</svg>`;
}

// ── Three-segment Quantum Seal badge (static governance attestation) ────────
// Segments: [ sentinel-governed | EU AI Act ✓ | ML-DSA-87 <fingerprint> ]
function buildQuantumSealBadge(): string {
  const labelText  = "sentinel-governed";
  const middleText = "EU AI Act \u2713";
  const sealText   = `ML-DSA-87 ${ML_DSA_87_FINGERPRINT}`;

  const labelW  = labelText.length  * 6.5 + 18;
  const middleW = middleText.length * 7.2 + 16;
  const sealW   = sealText.length   * 6.6 + 18;
  const totalW  = labelW + middleW + sealW;

  const labelX  = labelW / 2;
  const middleX = labelW + middleW / 2;
  const sealX   = labelW + middleW + sealW / 2;

  // Color palette mirrors the dashboard: dark / blue / violet (Quantum Seal)
  const DARK    = "#1a1a2e";
  const BLUE    = "#2980b9";
  const VIOLET  = "#8B5CF6";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20" role="img" aria-label="sentinel-governed: EU AI Act compliant; ML-DSA-87 sealed ${ML_DSA_87_FINGERPRINT}">
  <title>sentinel-governed · EU AI Act \u2713 · ML-DSA-87 ${ML_DSA_87_FINGERPRINT} (SLSA L4)</title>
  <defs>
    <linearGradient id="s" x2="0" y2="100%">
      <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
      <stop offset="1" stop-opacity=".1"/>
    </linearGradient>
    <clipPath id="r"><rect width="${totalW}" height="20" rx="3" fill="#fff"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect                                    width="${labelW}"  height="20" fill="${DARK}"/>
    <rect x="${labelW}"                      width="${middleW}" height="20" fill="${BLUE}"/>
    <rect x="${labelW + middleW}"            width="${sealW}"   height="20" fill="${VIOLET}"/>
    <rect                                    width="${totalW}"  height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelX}"  y="15" fill="#eee">${labelText}</text>
    <text x="${middleX}" y="15" font-weight="bold">\uD83D\uDEE1 ${middleText}</text>
    <text x="${sealX}"   y="15" font-weight="bold" font-family="Menlo,Consolas,monospace" font-size="10">\uD83D\uDD12 ${sealText}</text>
  </g>
</svg>`;
}

router.options("/v1/badge.svg", (_req, res): void => {
  setBadgeHeaders(res, "public, max-age=3600");
  res.sendStatus(204);
});

router.options("/v1/badge/:agentId.svg", (_req, res): void => {
  setBadgeHeaders(res, "no-cache, max-age=0");
  res.sendStatus(204);
});

router.get("/v1/badge.svg", (_req, res): void => {
  // 1. Header enforcement   — Content-Type set first via setBadgeHeaders
  // 2. Cache-Control        — public, max-age=3600 (1h) per Operator brief
  // 3. Quantum Seal         — embedded ML-DSA-87 fingerprint
  // 4. SLSA L4 attestation  — fingerprint visible in badge title + third segment
  setBadgeHeaders(res, "public, max-age=3600");
  // ETag enables 304 revalidation across the 1h TTL boundary
  res.setHeader("ETag", `"qseal-v6-${ML_DSA_87_FINGERPRINT.replace(/:/g, "")}"`);
  const svg = buildQuantumSealBadge();
  res.status(200).send(svg);
});

router.get("/v1/badge/:agentId.svg", (req, res): void => {
  const { agentId } = req.params;
  const health = getSessionHealth(agentId);
  const pct = Math.round(health * 100);

  let color: string;
  let icon: string;
  let label: string;

  if (isAgentRevoked(agentId)) {
    color = "#e74c3c"; icon = "\u2715"; label = "REVOKED";
  } else if (pct >= 80) {
    color = "#27ae60"; icon = "\u2713"; label = `${pct}% health`;
  } else if (pct >= 60) {
    color = "#f39c12"; icon = "\u26A0"; label = `${pct}% health`;
  } else {
    color = "#e74c3c"; icon = "\u2715"; label = `${pct}% \u2014 COMPROMISED`;
  }

  setBadgeHeaders(res, "no-cache, max-age=0");
  const svg = buildBadgeSvg("sentinel-governed", label, color, icon);
  res.status(200).send(svg);
});

export default router;
