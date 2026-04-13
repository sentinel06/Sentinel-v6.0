/**
 * Cognitive Drift Detector
 *
 * Monitors an agent's tool-call sequences against its "Model Card" baseline profile.
 * A Model Card profile is defined as the frequency distribution of event-type transitions
 * observed in the agent's historical log entries. Significant divergence from this
 * baseline indicates the agent's behavior has drifted — either due to prompt injection,
 * fine-tuning drift, or external manipulation.
 *
 * Algorithm:
 *   1. Build a baseline frequency map of event types from the last BASELINE_WINDOW entries.
 *   2. Compute the frequency map of the current DETECTION_WINDOW (last N calls).
 *   3. Measure drift as the Total Variation Distance (TVD) between the two distributions.
 *      TVD ranges from 0.0 (identical) to 1.0 (completely disjoint).
 *   4. Flag if TVD exceeds the configured threshold.
 *
 * EU AI Act Art. 9 — Risk Management: requires continuous monitoring of AI system behavior.
 */

export type DriftStatus = "CALIBRATING" | "STABLE" | "DRIFTING" | "CRITICAL_DRIFT";

export interface DriftReport {
  status: DriftStatus;
  driftScore: number;
  baselineSampleSize: number;
  currentWindowSize: number;
  baselineDistribution: Record<string, number>;
  currentDistribution: Record<string, number>;
  deviatingTypes: string[];
  recommendation: string;
}

const BASELINE_WINDOW = 100;
const DETECTION_WINDOW = 10;
const DRIFT_THRESHOLD = 0.35;
const CRITICAL_THRESHOLD = 0.6;
const MIN_BASELINE_SIZE = 15;

function buildFrequencyMap(events: string[]): Record<string, number> {
  const total = events.length;
  if (total === 0) return {};
  const counts: Record<string, number> = {};
  for (const e of events) counts[e] = (counts[e] ?? 0) + 1;
  const freq: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) freq[k] = v / total;
  return freq;
}

function totalVariationDistance(
  baseline: Record<string, number>,
  current: Record<string, number>,
): number {
  const allKeys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  let tvd = 0;
  for (const key of allKeys) {
    tvd += Math.abs((baseline[key] ?? 0) - (current[key] ?? 0));
  }
  return tvd / 2;
}

function findDeviatingTypes(
  baseline: Record<string, number>,
  current: Record<string, number>,
  threshold = 0.15,
): string[] {
  const allKeys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  const deviating: string[] = [];
  for (const key of allKeys) {
    const diff = Math.abs((baseline[key] ?? 0) - (current[key] ?? 0));
    if (diff >= threshold) deviating.push(key);
  }
  return deviating;
}

export function analyzeToolCallDrift(
  recentEventTypes: string[],
): DriftReport {
  if (recentEventTypes.length < MIN_BASELINE_SIZE) {
    return {
      status: "CALIBRATING",
      driftScore: 0,
      baselineSampleSize: recentEventTypes.length,
      currentWindowSize: 0,
      baselineDistribution: {},
      currentDistribution: {},
      deviatingTypes: [],
      recommendation: `Collecting baseline — ${MIN_BASELINE_SIZE - recentEventTypes.length} more events needed to establish Model Card profile.`,
    };
  }

  const effectiveBaseline = recentEventTypes.slice(
    0,
    Math.max(recentEventTypes.length - DETECTION_WINDOW, MIN_BASELINE_SIZE),
  );
  const currentWindow = recentEventTypes.slice(
    Math.max(recentEventTypes.length - DETECTION_WINDOW, 0),
  );

  const baselineDist = buildFrequencyMap(effectiveBaseline);
  const currentDist = buildFrequencyMap(currentWindow);
  const driftScore = totalVariationDistance(baselineDist, currentDist);
  const deviatingTypes = findDeviatingTypes(baselineDist, currentDist);

  let status: DriftStatus;
  let recommendation: string;

  if (driftScore >= CRITICAL_THRESHOLD) {
    status = "CRITICAL_DRIFT";
    recommendation =
      "Critical behavioral drift detected. Immediate human review required. " +
      "Consider activating kill-switch pending investigation. " +
      `Deviating types: ${deviatingTypes.join(", ")}.`;
  } else if (driftScore >= DRIFT_THRESHOLD) {
    status = "DRIFTING";
    recommendation =
      "Moderate drift from Model Card baseline. Flag for async review. " +
      `Tool call patterns shifting: ${deviatingTypes.join(", ")}.`;
  } else {
    status = "STABLE";
    recommendation = "Tool-call sequence within expected Model Card parameters.";
  }

  return {
    status,
    driftScore: Math.round(driftScore * 1000) / 1000,
    baselineSampleSize: effectiveBaseline.length,
    currentWindowSize: currentWindow.length,
    baselineDistribution: baselineDist,
    currentDistribution: currentDist,
    deviatingTypes,
    recommendation,
  };
}

export function buildDriftReportFromLogs(
  logs: Array<{ eventType: string }>,
): DriftReport {
  // DB returns rows in DESC order (newest first). Reverse so that index 0 = oldest
  // (baseline history) and the last DETECTION_WINDOW entries = most recent calls.
  const eventTypes = logs
    .slice(0, BASELINE_WINDOW)
    .map((l) => l.eventType)
    .reverse();
  return analyzeToolCallDrift(eventTypes);
}
