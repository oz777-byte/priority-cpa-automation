import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@priority-cpa/db';
import { AuditEventInputSchema } from './types.js';
import type { AuditEvent, AuditEventInput, AuditQuery, AuditStore } from './types.js';

interface AuditLogRow {
  id: string;
  ts: string;
  firm_id: string | null;
  company_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
  session_id: string | null;
}

function rowToEvent(row: AuditLogRow): AuditEvent {
  const event: AuditEvent = {
    id: row.id,
    ts: row.ts,
    companyId: row.company_id ?? '',
    userId: row.user_id ?? '',
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload,
  };
  const meta: AuditEvent['metadata'] = {};
  if (row.ip !== null) meta.ip = row.ip;
  if (row.user_agent !== null) meta.userAgent = row.user_agent;
  if (row.session_id !== null) meta.sessionId = row.session_id;
  if (Object.keys(meta).length > 0) {
    event.metadata = meta;
  }
  return event;
}

/**
 * Supabase-backed audit store. Writes go to the `audit_log` table; the DB
 * trigger blocks UPDATE / DELETE, so the append-only contract is enforced
 * end-to-end (TS-side via the absent API, DB-side via the trigger).
 *
 * Construct with the *admin* client (service role). Audit writes happen
 * server-side and need to bypass RLS.
 */
export class SupabaseAuditStore implements AuditStore {
  readonly #client: SupabaseClient;
  readonly #firmId: string | undefined;

  constructor(client: SupabaseClient, options: { firmId?: string } = {}) {
    this.#client = client;
    this.#firmId = options.firmId;
  }

  async log(input: AuditEventInput): Promise<AuditEvent> {
    const parsed = AuditEventInputSchema.parse(input);
    const id = parsed.id ?? randomUUID();
    const ts = parsed.ts ?? new Date().toISOString();
    const row: Omit<AuditLogRow, never> = {
      id,
      ts,
      firm_id: this.#firmId ?? null,
      company_id: parsed.companyId || null,
      user_id: parsed.userId || null,
      action: parsed.action,
      entity_type: parsed.entityType,
      entity_id: parsed.entityId,
      payload: parsed.payload,
      ip: parsed.metadata?.ip ?? null,
      user_agent: parsed.metadata?.userAgent ?? null,
      session_id: parsed.metadata?.sessionId ?? null,
    };
    const { data, error } = await this.#client
      .from('audit_log')
      .insert(row)
      .select()
      .single();
    if (error) {
      throw new Error(`SupabaseAuditStore.log failed: ${error.message}`);
    }
    return rowToEvent(data as AuditLogRow);
  }

  async query(filter: AuditQuery): Promise<AuditEvent[]> {
    let q = this.#client.from('audit_log').select('*').order('ts', { ascending: false });
    if (filter.companyId) q = q.eq('company_id', filter.companyId);
    if (filter.userId) q = q.eq('user_id', filter.userId);
    if (filter.entityType) q = q.eq('entity_type', filter.entityType);
    if (filter.entityId) q = q.eq('entity_id', filter.entityId);
    if (filter.action) {
      const actions = Array.isArray(filter.action) ? filter.action : [filter.action];
      q = q.in('action', actions);
    }
    if (filter.fromTs) q = q.gte('ts', filter.fromTs);
    if (filter.toTs) q = q.lte('ts', filter.toTs);
    if (filter.limit !== undefined) {
      const offset = filter.offset ?? 0;
      q = q.range(offset, offset + filter.limit - 1);
    } else if (filter.offset) {
      q = q.range(filter.offset, filter.offset + 999);
    }
    const { data, error } = await q;
    if (error) {
      throw new Error(`SupabaseAuditStore.query failed: ${error.message}`);
    }
    return (data as AuditLogRow[]).map(rowToEvent);
  }

  async count(filter: AuditQuery): Promise<number> {
    let q = this.#client.from('audit_log').select('*', { count: 'exact', head: true });
    if (filter.companyId) q = q.eq('company_id', filter.companyId);
    if (filter.userId) q = q.eq('user_id', filter.userId);
    if (filter.entityType) q = q.eq('entity_type', filter.entityType);
    if (filter.entityId) q = q.eq('entity_id', filter.entityId);
    if (filter.action) {
      const actions = Array.isArray(filter.action) ? filter.action : [filter.action];
      q = q.in('action', actions);
    }
    if (filter.fromTs) q = q.gte('ts', filter.fromTs);
    if (filter.toTs) q = q.lte('ts', filter.toTs);
    const { count, error } = await q;
    if (error) {
      throw new Error(`SupabaseAuditStore.count failed: ${error.message}`);
    }
    return count ?? 0;
  }
}
