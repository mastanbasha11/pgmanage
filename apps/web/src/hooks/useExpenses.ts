import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Expense {
  id: string;
  category_id?: string;
  category_name: string;
  description: string;
  vendor_name?: string;
  paid_by?: string;
  amount_paise: number;
  purchase_date: string;
  expense_date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  payment_mode?: string;
  reference_number?: string;
  receipt_path?: string;
  bill_photo_s3_key?: string;
  bill_photo_url?: string;
  submitted_by_name?: string;
}

export interface ExpenseSummaryItem {
  category_id?: string;
  category_name: string;
  total_paise: number;
  count: number;
  percentage: number;
}

export interface ExpenseByPerson {
  person: string;
  total_paise: number;
  count: number;
}

export interface RecurringItem {
  item: string;
  total_paise: number;
  count: number;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  icon_name?: string;
  is_default: boolean;
  sort_order: number;
}

export function useExpenses(params?: {
  property_id?: string;
  month?: number;
  year?: number;
  approval_status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  category_id?: string;
  paid_by?: string;
  payment_mode?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE';
  q?: string;
}) {
  return useQuery<{ items: Expense[]; total: number }>({
    queryKey: ['expenses', params],
    queryFn: () =>
      api
        .get('/expenses', {
          params: Object.fromEntries(
            Object.entries(params ?? {}).filter(
              ([, v]) => v !== undefined && v !== '' && v !== null,
            ),
          ),
        })
        .then((r) => r.data),
  });
}

export function useExpenseSummary(params?: {
  property_id?: string;
  month?: number;
  year?: number;
}) {
  return useQuery<{
    items: ExpenseSummaryItem[];
    total_paise: number;
    by_person?: ExpenseByPerson[];
    recurring_items?: RecurringItem[];
    previous_items?: { category_name: string; total_paise: number; count: number }[];
    previous_recurring_items?: { item: string; total_paise: number; count: number }[];
    previous_period_start?: string;
    previous_period_end?: string;
    period_start?: string;
    period_end?: string;
  }>({
    queryKey: ['expense-summary', params],
    queryFn: () => api.get('/expenses/summary', { params }).then((r) => r.data),
  });
}

/**
 * Backend requires property_id; the hook is gated on it being present.
 */
export function useExpenseCategories(propertyId: string | undefined) {
  return useQuery<{ items: ExpenseCategory[] }>({
    queryKey: ['expense-categories', propertyId],
    queryFn: () =>
      api
        .get('/expense-categories', { params: { property_id: propertyId } })
        .then((r) => r.data),
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      category_id: string;
      description?: string;
      vendor_name?: string;
      paid_by?: string;
      amount_paise: number;
      purchase_date: string;
      property_id: string;
      payment_mode?: string;
      reference_number?: string;
      bill_photo_s3_key?: string;
    }) => api.post('/expenses', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateExpense(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      category_id?: string;
      amount_paise?: number;
      description?: string;
      vendor_name?: string;
      paid_by?: string;
      purchase_date?: string;
      payment_mode?: string;
      reference_number?: string;
    }) => api.patch(`/expenses/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUploadReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post(`/expenses/${id}/receipt`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

export function useDeleteReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}/receipt`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

/**
 * Build a fully-qualified URL for a receipt that includes the JWT in the
 * fetch request — uses an object URL so it can be assigned to <img src>.
 */
export function receiptUrl(expenseId: string): string {
  return `/api/v1/expenses/${expenseId}/receipt`;
}

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
      qc.invalidateQueries({ queryKey: ['expense-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
