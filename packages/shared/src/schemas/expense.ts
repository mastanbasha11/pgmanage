import { z } from 'zod';

export const CreateExpenseSchema = z.object({
  category_id: z.string().uuid(),
  description: z.string().min(3).max(500),
  amount_paise: z.number().int().positive(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  property_id: z.string().uuid(),
  bill_photo_s3_key: z.string().optional(),
});

export const ExpenseStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export type CreateExpense = z.infer<typeof CreateExpenseSchema>;
export type ExpenseStatus = z.infer<typeof ExpenseStatusSchema>;
