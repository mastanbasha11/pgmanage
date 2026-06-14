/**
 * Weekly menu uploads — admin-side TanStack Query hooks.
 *
 * One-step upload: POST /menu/upload as multipart/form-data. The
 * backend streams the file to disk under the EC2 UPLOAD_ROOT (same as
 * tenant ID-proofs) — no S3, no presigned URLs.
 *
 * Preview URLs come from POST /menu/{id}/file-url, which mints a
 * 5-minute token-signed URL we can stick into window.open() without
 * passing the JWT.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface MenuUpload {
  id: string;
  property_id: string;
  week_start_date: string;
  s3_key: string; // filesystem-relative path, kept under the legacy name
  content_type: string;
  original_filename?: string | null;
  title?: string | null;
  uploaded_by?: string | null;
  uploaded_at: string;
}

interface UploadArgs {
  property_id: string;
  week_start_date: string;
  title?: string;
  file: File;
}

export function useUploadMenu() {
  const qc = useQueryClient();
  return useMutation<{ id: string; week_start_date: string }, unknown, UploadArgs>({
    mutationFn: async ({ property_id, week_start_date, title, file }) => {
      const form = new FormData();
      form.append('property_id', property_id);
      form.append('week_start_date', week_start_date);
      if (title) form.append('title', title);
      form.append('file', file);
      const r = await api.post('/menu/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['menu', vars.property_id] });
    },
  });
}

export function useMenus(propertyId: string | null | undefined, limit = 20) {
  return useQuery<{ items: MenuUpload[] }>({
    queryKey: ['menu', propertyId, limit],
    queryFn: () =>
      api.get('/menu', { params: { property_id: propertyId, limit } }).then((r) => r.data),
    enabled: Boolean(propertyId),
  });
}

export function useMenuFileUrl() {
  return useMutation<{ url: string }, unknown, string>({
    mutationFn: (menuId) => api.get(`/menu/${menuId}/file-url`).then((r) => r.data),
  });
}

export function useDeleteMenu() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, { id: string; property_id: string }>({
    mutationFn: ({ id }) => api.delete(`/menu/${id}`).then((r) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['menu', vars.property_id] });
    },
  });
}
