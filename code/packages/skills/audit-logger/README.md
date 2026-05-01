# @priority-cpa/audit-logger

Append-only audit trail. Compliance requirement: Israeli Tax Authority mandates 7-year retention of every write to the books.

## API

```ts
import { InMemoryAuditStore } from '@priority-cpa/audit-logger';

const store = new InMemoryAuditStore();
await store.log({
  companyId: 'tari',
  userId: 'shani',
  action: 'invoice.create',
  entityType: 'invoice',
  entityId: 'wertheim-4427930',
  payload: { number: '4427930', total: 572.0 },
});
const recent = await store.query({ companyId: 'tari', limit: 50 });
```

## Action namespaces

`namespace.verb` (lowercase, snake_case). Reserved namespaces: `invoice`, `je`, `batch`, `supplier`, `account_rule`, `company`, `user`, `auth`, `export`, `config`.

Examples: `invoice.create`, `je.update`, `batch.export`, `supplier.alias_learned`, `auth.failed`, `config.account_rule_added`.

## Append-only

The `AuditStore` interface intentionally has no `update` or `delete`. The DB-backed implementation (Phase 1 M2) will enforce this with Postgres triggers (`UPDATE`/`DELETE` on `audit_log` raise an exception). Soft-delete semantics belong on the *target* tables, not in the audit log.

## Implementations

- `InMemoryAuditStore` — for tests and dev. Events live in process memory.
- `SupabaseAuditStore` — coming with M2 (Phase 1).
