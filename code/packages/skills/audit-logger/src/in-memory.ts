import { randomUUID } from 'node:crypto';
import { AuditEventInputSchema } from './types.js';
import type { AuditEvent, AuditQuery, AuditStore, AuditEventInput } from './types.js';

export class InMemoryAuditStore implements AuditStore {
  readonly #events: AuditEvent[] = [];

  async log(input: AuditEventInput): Promise<AuditEvent> {
    const parsed = AuditEventInputSchema.parse(input);
    const stored: AuditEvent = {
      id: parsed.id ?? randomUUID(),
      ts: parsed.ts ?? new Date().toISOString(),
      companyId: parsed.companyId,
      userId: parsed.userId,
      action: parsed.action,
      entityType: parsed.entityType,
      entityId: parsed.entityId,
      payload: parsed.payload,
      ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
    };
    this.#events.push(stored);
    return stored;
  }

  async query(filter: AuditQuery): Promise<AuditEvent[]> {
    const matched = this.#events.filter((e) => matches(e, filter));
    matched.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 1000;
    return matched.slice(offset, offset + limit);
  }

  async count(filter: AuditQuery): Promise<number> {
    return this.#events.filter((e) => matches(e, filter)).length;
  }

  /** Diagnostic only — append-only contract makes a real "delete" impossible. */
  size(): number {
    return this.#events.length;
  }
}

function matches(event: AuditEvent, filter: AuditQuery): boolean {
  if (filter.companyId && event.companyId !== filter.companyId) return false;
  if (filter.userId && event.userId !== filter.userId) return false;
  if (filter.entityType && event.entityType !== filter.entityType) return false;
  if (filter.entityId && event.entityId !== filter.entityId) return false;
  if (filter.action) {
    const actions = Array.isArray(filter.action) ? filter.action : [filter.action];
    if (!actions.includes(event.action)) return false;
  }
  if (filter.fromTs && event.ts < filter.fromTs) return false;
  if (filter.toTs && event.ts > filter.toTs) return false;
  return true;
}
