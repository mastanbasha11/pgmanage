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

export interface Expense {
  id: string;
  property_id: string;
  category_id?: string;
  category_name?: string;
  amount_paise: number;
  description?: string;
  paid_by?: string;
  paid_by_name?: string;
  payment_mode?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE';
  reference_number?: string;
  spent_at: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  receipt_url?: string | null;
  created_at: string;
}

export function useExpenses(params: {
  property_id?: string;
  month?: number;
  year?: number;
  scope?: 'mine' | 'everyone';
  category_id?: string;
  paid_by?: string;
  status?: string;
  payment_mode?: string;
  search?: string;
}) {
  return useQuery<{ items: Expense[]; total: number }>({
    queryKey: ['expenses', params],
    queryFn: () => api.get('/expenses', { params }).then((r) => r.data),
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

export interface CreateExpensePayload {
  property_id: string;
  category_id?: string;
  amount_paise: number;
  description?: string;
  paid_by?: string;
  payment_mode?: Expense['payment_mode'];
  reference_number?: string;
  spent_at: string;
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

export function useApproveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/expenses/${id}/approve`, { decision }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
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
