import { z } from 'zod';

export {
  CanonicalInvoiceSchema,
} from '@priority-cpa/invoice-schema';
export type {
  CanonicalInvoice,
} from '@priority-cpa/invoice-schema';

export const MoveInConfigSchema = z.object({
  transactionType: z.string().min(1).max(3),
  expenseAccount: z.string().min(1).max(8),
  vatInputAccount: z.string().min(1).max(8),
  currency: z.string().length(3),
  detailsPrefix: z.string().min(1),
});

export type MoveInConfig = z.infer<typeof MoveInConfigSchema>;
