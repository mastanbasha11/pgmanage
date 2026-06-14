/**
 * Weekly menu uploads — admin-side TanStack Query hooks.
 *
 * Flow for uploading a new menu file:
 *
 *   1. Call useMenuUploadUrl() to mint a presigned PUT URL + s3_key.
 *   2. PUT the File directly to S3 with the returned content-type.
 *   3. Call useCreateMenu() with the returned s3_key + metadata to
 *      persist the row.
 *
 * `useCreateMenu` invalidates the list query on success so the new
 * upload appears immediately.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '@/lib/api';

export interface MenuUpload {
  id: string;
  property_id: string;
  week_start_date: string; // ISO date
  s3_key: string;
  content_type: string;
  original_filename?: string | null;
  title?: string | null;
  uploaded_by?: string | null;
  uploaded_at: string;
}

interface PresignedUpload {
  upload_url: string;
  s3_key: string;
  expires_in: number;
  content_type: string;
}

interface CreatePayload {
  property_id: string;
  week_start_date: string;
  s3_key: string;
  content_type: string;
  original_filename?: string;
  title?: string;
}

/** Step 1 — request a presigned PUT URL. */
export function useMenuUploadUrl() {
  return useMutation<PresignedUpload, unknown, { property_id: string; filename: string }>(
    {
      mutationFn: (body) => api.post('/menu/upload-url', body).then((r) => r.data),
    },
  );
}

/** Step 2 — PUT the file directly to S3. Skips the api axios instance
 * because the presigned URL is to S3, not our backend, and the
 * Authorization header (Bearer JWT) would fail the request. */
export async function uploadFileToS3(
  presigned: PresignedUpload,
  file: File,
): Promise<void> {
  await axios.put(presigned.upload_url, file, {
    headers: { 'Content-Type': presigned.content_type },
  });
}

/** Step 3 — persist the row. */
export function useCreateMenu() {
  const qc = useQueryClient();
  return useMutation<{ id: string; week_start_date: string }, unknown, CreatePayload>({
    mutationFn: (body) => api.post('/menu', body).then((r) => r.data),
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
