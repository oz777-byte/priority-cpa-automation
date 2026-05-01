import { z } from 'zod';

export const AUDIT_ACTION_NAMESPACES = [
  'invoice',
  'je',
  'batch',
  'supplier',
  'account_rule',
  'company',
  'user',
  'auth',
  'export',
  'config',
] as const;

export const AuditEventInputSchema = z.object({
  companyId: z.string().default(''),
  userId: z.string().default(''),
  action: z.string().regex(/^[a-z_]+\.[a-z_]+$/, 'action must be "namespace.verb" lowercase'),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  metadata: z
    .object({
      ip: z.string().optional(),
      userAgent: z.string().optional(),
      sessionId: z.string().optional(),
    })
    .optional(),
  ts: z.string().optional(),
  id: z.string().optional(),
});
export type AuditEventInput = z.infer<typeof AuditEventInputSchema>;

export interface AuditEvent {
  id: string;
  ts: string;
  companyId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  metadata?: {
    ip?: string | undefined;
    userAgent?: string | undefined;
    sessionId?: string | undefined;
  };
}

export interface AuditQuery {
  companyId?: string;
  userId?: string;
  action?: string | string[];
  entityType?: string;
  entityId?: string;
  fromTs?: string;
  toTs?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStore {
  log(event: AuditEventInput): Promise<AuditEvent>;
  query(filter: AuditQuery): Promise<AuditEvent[]>;
  count(filter: AuditQuery): Promise<number>;
}
