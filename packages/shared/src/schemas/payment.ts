import { z } from 'zod';

export const PaymentTypeSchema = z.enum([
  'RENT',
  'ADVANCE',
  'DEPOSIT',
  'MAINTENANCE',
  'OTHER',
]);

export const PaymentModeSchema = z.enum([
  'CASH',
  'UPI',
  'BANK_TRANSFER',
  'CHEQUE',
]);

export const RecordPaymentSchema = z.object({
  tenant_id: z.string().uuid(),
  amount_paise: z.number().int().positive('Must be a positive integer (paise)'),
  payment_type: PaymentTypeSchema,
  payment_mode: PaymentModeSchema,
  for_month: z.number().int().min(1).max(12).optional(),
  for_year: z.number().int().min(2020).max(2099).optional(),
  notes: z.string().max(500).optional(),
});

export const LedgerEntryStatusSchema = z.enum([
  'PENDING',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'WAIVED',
]);

export type RecordPayment = z.infer<typeof RecordPaymentSchema>;
export type LedgerEntryStatus = z.infer<typeof LedgerEntryStatusSchema>;
