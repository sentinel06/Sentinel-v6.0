import { EventEmitter } from 'events';
class SentinelEventHub extends EventEmitter {}
export const sentinelEvents = new SentinelEventHub();
export const SENTINEL_EVENTS = {
  SECRET_INTERCEPTED: 'secret:intercepted'
};
