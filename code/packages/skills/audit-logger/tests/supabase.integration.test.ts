import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@priority-cpa/db';
import { SupabaseAuditStore } from '../src/index.js';
import type { SupabaseClient } from '@priority-cpa/db';
import type { AuditEventInput } from '../src/index.js';

const HAS_ENV =
  !!process.env.SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.SUPABASE_PUBLISHABLE_KEY;

const RUN = HAS_ENV ? describe : describe.skip;

RUN('SupabaseAuditStore — integration (real DB)', () => {
  let store: SupabaseAuditStore;
  let admin: SupabaseClient;
  // Unique per-run namespace so concurrent test runs do not collide.
  const runId = randomUUID();
  const entityIdFor = (suffix: string) => `${runId}-${suffix}`;

  beforeAll(() => {
    admin = createAdminClient();
    store = new SupabaseAuditStore(admin);
  });

  function makeEvent(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
    return {
      companyId: '',
      userId: '',
      action: 'invoice.create',
      entityType: 'invoice',
      entityId: entityIdFor('default'),
      payload: { runId, ...(overrides.payload ?? {}) },
      ...overrides,
    };
  }

  it('writes an event and reads it back', async () => {
    const written = await store.log(
      makeEvent({ entityId: entityIdFor('a'), payload: { number: '4427930' } }),
    );
    expect(written.id).toBeTruthy();
    expect(written.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const fetched = await store.query({ entityId: entityIdFor('a') });
    expect(fetched.length).toBeGreaterThanOrEqual(1);
    expect(fetched[0]?.action).toBe('invoice.create');
    expect((fetched[0]?.payload as { number?: string }).number).toBe('4427930');
  });

  it('respects action filter', async () => {
    await store.log(makeEvent({ entityId: entityIdFor('b'), action: 'invoice.create' }));
    await store.log(makeEvent({ entityId: entityIdFor('b'), action: 'invoice.update' }));

    const created = await store.query({
      entityId: entityIdFor('b'),
      action: 'invoice.create',
    });
    expect(created.every((e) => e.action === 'invoice.create')).toBe(true);
    expect(created.length).toBeGreaterThanOrEqual(1);

    const both = await store.query({
      entityId: entityIdFor('b'),
      action: ['invoice.create', 'invoice.update'],
    });
    expect(both.length).toBeGreaterThanOrEqual(2);
  });

  it('returns events in descending ts order', async () => {
    const e1 = await store.log(
      makeEvent({ entityId: entityIdFor('c'), ts: '2026-05-01T10:00:00Z' }),
    );
    const e2 = await store.log(
      makeEvent({ entityId: entityIdFor('c'), ts: '2026-05-03T10:00:00Z' }),
    );
    const e3 = await store.log(
      makeEvent({ entityId: entityIdFor('c'), ts: '2026-05-02T10:00:00Z' }),
    );

    const events = await store.query({ entityId: entityIdFor('c') });
    const ids = events.map((e) => e.id);
    expect(ids[0]).toBe(e2.id);
    expect(ids[1]).toBe(e3.id);
    expect(ids[2]).toBe(e1.id);
  });

  it('count matches query length', async () => {
    const entity = entityIdFor('count');
    await store.log(makeEvent({ entityId: entity }));
    await store.log(makeEvent({ entityId: entity }));
    await store.log(makeEvent({ entityId: entity }));

    const c = await store.count({ entityId: entity });
    expect(c).toBe(3);
  });

  it('the DB trigger blocks UPDATE on audit_log (append-only enforced)', async () => {
    const written = await store.log(makeEvent({ entityId: entityIdFor('immutable') }));
    const { error } = await admin
      .from('audit_log')
      .update({ action: 'tampered.action' })
      .eq('id', written.id);
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/append-only|forbidden|UPDATE/i);
  });

  it('the DB trigger blocks DELETE on audit_log', async () => {
    const written = await store.log(makeEvent({ entityId: entityIdFor('undeletable') }));
    const { error } = await admin.from('audit_log').delete().eq('id', written.id);
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/append-only|forbidden|DELETE/i);
  });
});
