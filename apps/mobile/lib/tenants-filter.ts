/**
 * Translates the UI's tenant-status filter into backend query params.
 *
 * The 'NOTICE' filter is virtual: under the hood it's status=ACTIVE +
 * has_notice=true. This file keeps the translation in one place so the
 * mobile list and the web list don't drift.
 */

export type StatusFilter = 'ACTIVE' | 'NOTICE' | 'CHECKED_OUT' | 'ALL';

export interface TenantQueryParams {
  status?: string;
  has_notice?: boolean;
}

export function buildTenantParams(filter: StatusFilter): TenantQueryParams {
  if (filter === 'ALL') return {};
  if (filter === 'NOTICE') return { status: 'ACTIVE', has_notice: true };
  return { status: filter };
}
