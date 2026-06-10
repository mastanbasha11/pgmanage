/**
 * lib/tenants-filter.ts — Notice-given filter is virtual; both web and
 * mobile must translate it to status=ACTIVE + has_notice=true. If a
 * regression breaks this, the mobile residents page would silently drop
 * the notice-given filter and show every active tenant instead.
 */
import { buildTenantParams } from '../lib/tenants-filter';

describe('buildTenantParams', () => {
  test('ACTIVE → status=ACTIVE, no has_notice flag', () => {
    expect(buildTenantParams('ACTIVE')).toEqual({ status: 'ACTIVE' });
  });

  test('CHECKED_OUT → status=CHECKED_OUT', () => {
    expect(buildTenantParams('CHECKED_OUT')).toEqual({ status: 'CHECKED_OUT' });
  });

  test('ALL → no status filter, no has_notice', () => {
    expect(buildTenantParams('ALL')).toEqual({});
  });

  test('NOTICE → virtual filter: status=ACTIVE + has_notice=true', () => {
    expect(buildTenantParams('NOTICE')).toEqual({ status: 'ACTIVE', has_notice: true });
  });
});
