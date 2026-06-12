/**
 * Phone normalisation — must match the backend's tenant_portal._normalise_phone.
 * Tests in __tests__/phone.test.ts lock the contract.
 */
export function normalisePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('91') && local.length === 12) local = local.slice(2);
  else if (local.startsWith('0') && local.length === 11) local = local.slice(1);
  if (local.length === 10 && /^[6789]/.test(local)) return `+91${local}`;
  // Fall back to whatever the user typed (trimmed). Backend will fail to
  // resolve and return delivery:none — same as for unknown phones.
  return raw.trim();
}

/** Cheap client-side guard so we don't ping the server for obvious typos. */
export function looksLikeIndianMobile(raw: string): boolean {
  return /^\+91[6789]\d{9}$/.test(normalisePhone(raw));
}
