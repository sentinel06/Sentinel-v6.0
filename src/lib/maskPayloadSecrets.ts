
// --- Enterprise Telemetry Extension ---
import { sentinelEvents, SENTINEL_EVENTS } from './events.js';

// Note: Inject this inside your request handler right where matchCount > 0
export function emitComplianceEvent(req: any, matchCount: number, detectedTriggers: string[]) {
  sentinelEvents.emit(SENTINEL_EVENTS.SECRET_INTERCEPTED, {
    organizationId: req.headers['x-organization-id'] || 'default_org',
    endpointHit: req.originalUrl || req.url,
    requestMethod: req.method,
    triggerType: detectedTriggers.join(', ') || 'REGEX_MATCH',
    redactedFieldsCount: matchCount,
    clientIpMasked: (req.ip || '0.0.0.0').replace(/\.\d+\.\d+$/, '.X.X')
  });
}
