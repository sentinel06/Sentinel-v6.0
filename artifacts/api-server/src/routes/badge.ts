/**
 * Badge Routes — Dynamic SVG governance badges
 *
 * These are registered FIRST in routes/index.ts to guarantee they are never
 * shadowed by a catch-all or redirect handler.
 *
 * GET /v1/badge.svg               — Generic "sentinel-governed | EU AI Act compliant" badge
 * GET /v1/badge/:agentId.svg      — Per-agent live health badge
 */

import { Router, type IRouter } from "express";
import {
  getSessionHealth,
  isAgentRevoked,
} from "../lib/governance";

const router: IRouter = Router();

function setBadgeHeaders(res: import("express").Response, cacheControl: string): void {
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

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

router.options("/v1/badge.svg", (_req, res): void => {
  setBadgeHeaders(res, "public, max-age=86400");
  res.sendStatus(204);
});

router.options("/v1/badge/:agentId.svg", (_req, res): void => {
  setBadgeHeaders(res, "no-cache, max-age=0");
  res.sendStatus(204);
});

router.get("/v1/badge.svg", (_req, res): void => {
  const svg = buildBadgeSvg("sentinel-governed", "EU AI Act compliant", "#2980b9", "\uD83D\uDEE1");
  setBadgeHeaders(res, "public, max-age=86400");
  res.send(svg);
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

  const svg = buildBadgeSvg("sentinel-governed", label, color, icon);
  setBadgeHeaders(res, "no-cache, max-age=0");
  res.send(svg);
});

export default router;
