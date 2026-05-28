import pg from 'pg';
import { sentinelEvents, SENTINEL_EVENTS } from '../lib/events.js';

const { Pool } = pg;

if (process.env.ENTERPRISE_DATABASE_URL) {
  const pool = new Pool({
    connectionString: process.env.ENTERPRISE_DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000
  });

  sentinelEvents.on(SENTINEL_EVENTS.SECRET_INTERCEPTED, async (meta) => {
    const query = `
      INSERT INTO enterprise_audit_logs (
        organization_id, environment, endpoint_hit, request_method, trigger_type, redacted_fields_count, client_ip_masked
      ) VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;
    try {
      await pool.query(query, [
        meta.organizationId,
        process.env.NODE_ENV || 'production',
        meta.endpointHit,
        meta.requestMethod,
        meta.triggerType,
        meta.redactedFieldsCount,
        meta.clientIpMasked
      ]);
    } catch (error) {
      console.error('[ENTERPRISE AUDIT ERROR]: Failed to persist compliance log:', error);
    }
  });
}
