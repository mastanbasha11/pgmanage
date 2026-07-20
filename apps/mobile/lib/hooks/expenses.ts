/**
 * Expenses + categories + receipts + approval.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export interface ExpenseCategory {
  id: string;
  name: string;
  color?: string;
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Field names mirror the SELECT in app/api/v1/expenses.py exactly. The
 *  backend aliases `approval_status as status`, so both are present; prefer
 *  `approval_status` since that is also the query-param name. */
export interface Expense {
  id: string;
  category_id?: string;
  category_name?: string;
  icon_name?: string | null;
  amount_paise: number;
  description?: string;
  vendor_name?: string | null;
  paid_by?: string;
  submitted_by_name?: string | null;
  payment_mode?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE';
  reference_number?: string;
  /** Date the money was spent. There is no `spent_at` field. */
  purchase_date: string;
  expense_date: string;
  approval_status: ApprovalStatus;
  status: ApprovalStatus;
  receipt_path?: string | null;
  bill_photo_s3_key?: string | null;
  created_at: string;
}

/**
 * Params are exactly the ones the endpoint declares. Anything else is silently
 * dropped by FastAPI — `page_size`, `scope` and `search` used to be sent here
 * and did nothing, which is why the Mine/Everyone toggle never filtered.
 */
export function useExpenses(params: {
  property_id?: string;
  month?: number;
  year?: number;
  category_id?: string;
  /** Case-insensitive match on the free-text payer name. */
  paid_by?: string;
  approval_status?: ApprovalStatus;
  payment_mode?: string;
  q?: string;
  limit?: number;
}) {
  return useQuery<{ items: Expense[]; total: number }>({
    queryKey: ['expenses', params],
    queryFn: () =>
      api.get('/expenses', { params: { limit: 200, ...params } }).then((r) => r.data),
    enabled: !!params.property_id,
  });
}

export function useExpenseSummary(params: { property_id?: string; month?: number; year?: number }) {
  return useQuery({
    queryKey: ['expenses', 'summary', params],
    queryFn: () => api.get('/expenses/summary', { params }).then((r) => r.data),
    enabled: !!params.property_id,
  });
}

export function useExpenseCategories() {
  return useQuery<{ items: ExpenseCategory[] }>({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/expense-categories').then((r) => r.data),
  });
}

/** Mirrors `ExpenseCreate` in app/api/v1/expenses.py. `category_id` and
 *  `purchase_date` are required there — sending `spent_at` (as this used to)
 *  produced a 422. */
export interface CreateExpensePayload {
  property_id: string;
  category_id: string;
  amount_paise: number;
  purchase_date: string;
  description?: string;
  vendor_name?: string;
  paid_by?: string;
  payment_mode?: Expense['payment_mode'];
  reference_number?: string;
  bill_photo_s3_key?: string;
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateExpensePayload) => api.post('/expenses', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<CreateExpensePayload>) =>
      api.patch(`/expenses/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

/** PATCH (not POST) with `{approved, rejection_reason}` — see `ExpenseApproval`
 *  in app/api/v1/expenses.py. The old `{decision}` POST would 404 then 422. */
export function useApproveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      approved,
      rejection_reason,
    }: {
      id: string;
      approved: boolean;
      rejection_reason?: string;
    }) =>
      api
        .patch(`/expenses/${id}/approve`, { approved, rejection_reason })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUploadExpenseReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, uri, filename, mime }: { id: string; uri: string; filename: string; mime: string }) => {
      const fd = new FormData();
      fd.append('file', { uri, name: filename, type: mime } as unknown as Blob);
      const r = await api.post(`/expenses/${id}/receipt`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

export function useDeleteExpenseReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}/receipt`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}
