import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAuditStore } from '../src/index.js';
import type { AuditEventInput } from '../src/index.js';

const sample: AuditEventInput = {
  companyId: 'tari',
  userId: 'shani',
  action: 'invoice.create',
  entityType: 'invoice',
  entityId: 'wertheim-4427930',
  payload: { number: '4427930', total: 572.0 },
};

describe('InMemoryAuditStore', () => {
  let store: InMemoryAuditStore;
  beforeEach(() => {
    store = new InMemoryAuditStore();
  });

  it('assigns id and ts when missing', async () => {
    const e = await store.log(sample);
    expect(e.id).toBeTruthy();
    expect(e.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('preserves provided id and ts', async () => {
    const e = await store.log({ ...sample, id: 'custom-id', ts: '2026-05-02T10:00:00Z' });
    expect(e.id).toBe('custom-id');
    expect(e.ts).toBe('2026-05-02T10:00:00Z');
  });

  it('rejects malformed action namespace', async () => {
    await expect(store.log({ ...sample, action: 'badAction' })).rejects.toThrow();
    await expect(store.log({ ...sample, action: 'Invoice.Create' })).rejects.toThrow();
  });

  it('returns events sorted descending by ts', async () => {
    await store.log({ ...sample, ts: '2026-05-01T10:00:00Z', entityId: 'a' });
    await store.log({ ...sample, ts: '2026-05-03T10:00:00Z', entityId: 'b' });
    await store.log({ ...sample, ts: '2026-05-02T10:00:00Z', entityId: 'c' });
    const events = await store.query({});
    expect(events.map((e) => e.entityId)).toEqual(['b', 'c', 'a']);
  });

  it('filters by companyId', async () => {
    await store.log({ ...sample, companyId: 'tari' });
    await store.log({ ...sample, companyId: 'other' });
    const tariEvents = await store.query({ companyId: 'tari' });
    expect(tariEvents).toHaveLength(1);
    expect(tariEvents[0]?.companyId).toBe('tari');
  });

  it('filters by action (single or array)', async () => {
    await store.log({ ...sample, action: 'invoice.create' });
    await store.log({ ...sample, action: 'invoice.update' });
    await store.log({ ...sample, action: 'je.create' });

    expect(await store.query({ action: 'invoice.create' })).toHaveLength(1);
    expect(
      await store.query({ action: ['invoice.create', 'invoice.update'] }),
    ).toHaveLength(2);
  });

  it('filters by ts range', async () => {
    await store.log({ ...sample, ts: '2026-04-30T10:00:00Z' });
    await store.log({ ...sample, ts: '2026-05-02T10:00:00Z' });
    await store.log({ ...sample, ts: '2026-05-04T10:00:00Z' });
    const r = await store.query({
      fromTs: '2026-05-01T00:00:00Z',
      toTs: '2026-05-03T00:00:00Z',
    });
    expect(r).toHaveLength(1);
  });

  it('count is consistent with query', async () => {
    await store.log({ ...sample });
    await store.log({ ...sample, action: 'invoice.update' });
    expect(await store.count({})).toBe(2);
    expect(await store.count({ action: 'invoice.create' })).toBe(1);
  });

  it('does not expose mutation API (append-only contract)', () => {
    expect((store as unknown as { delete?: unknown }).delete).toBeUndefined();
    expect((store as unknown as { update?: unknown }).update).toBeUndefined();
  });
});
