// Shared type definitions used across web and mobile

export type Role = 'OWNER' | 'PARTNER' | 'PROPERTY_MANAGER' | 'SUPERVISOR';
export type TenantRole = 'TENANT';

export interface JwtPayload {
  sub: string;
  user_id: string;
  org_id: string;
  role: Role;
  name: string;
  property_ids: string[] | null;
  exp: number;
  iat: number;
}

export interface TenantJwtPayload {
  sub: string;
  tenant_id: string;
  property_id: string;
  org_id: string;
  role: TenantRole;
  name: string;
  exp: number;
  iat: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

// Money helpers (keep all money as integer paise)
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}
