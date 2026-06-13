/**
 * Mock DB seed sanity — guards against accidental schema regression
 * (e.g. a renamed field that nobody updated in the seed).
 */
import {
  mockDues,
  mockLedger,
  mockMealsThisWeek,
  mockNotices,
  mockProfile,
  mockReferrals,
  mockReferralSummary,
  mockTickets,
} from '../lib/data/mock/db';

describe('mock seed', () => {
  it('profile has the single-property fields the app expects', () => {
    expect(mockProfile.id).toBeTruthy();
    expect(mockProfile.name).toBeTruthy();
    expect(mockProfile.property.name).toBeTruthy();
    expect(mockProfile.room.roomNumber).toBeTruthy();
    expect(mockProfile.lease.monthlyRentPaise).toBeGreaterThan(0);
    expect(mockProfile.walletBalancePaise).toBeGreaterThanOrEqual(0);
  });

  it('profile starts with kycComplete=false so the demo enters onboarding', () => {
    // Set explicitly in the seed so the resident-app first-run demo
    // walks the new user through the onboarding flow. Once /onboarding
    // posts the KYC, this flips true and home becomes the landing screen.
    expect(mockProfile.kycComplete).toBe(false);
    expect(mockProfile.vehicle.type).toBe('NONE');
    expect(mockProfile.emergency).toBeNull();
  });

  it('current dues total equals the sum of line amounts', () => {
    const sum = mockDues.lines.reduce((s, l) => s + l.amountPaise, 0);
    expect(mockDues.totalPaise).toBe(sum);
  });

  it('ledger entries each carry month/year/total/paid + status', () => {
    expect(mockLedger.length).toBeGreaterThan(0);
    for (const e of mockLedger) {
      expect(e.month).toBeGreaterThanOrEqual(1);
      expect(e.month).toBeLessThanOrEqual(12);
      expect(e.year).toBeGreaterThan(2020);
      expect(e.totalPaise).toBeGreaterThan(0);
      expect(['paid', 'partial', 'due', 'overdue']).toContain(e.status);
    }
  });

  it('meals seed covers every slot for the week', () => {
    const slots = new Set(mockMealsThisWeek.map((m) => m.slot));
    expect(slots.has('breakfast')).toBe(true);
    expect(slots.has('lunch')).toBe(true);
    expect(slots.has('dinner')).toBe(true);
  });

  it('tickets each have a timeline that ends at the current status', () => {
    for (const t of mockTickets) {
      expect(t.timeline.length).toBeGreaterThan(0);
      expect(t.timeline[t.timeline.length - 1]!.status).toBe(t.status);
    }
  });

  it('notices have body text', () => {
    for (const n of mockNotices) {
      expect(n.body.length).toBeGreaterThan(10);
    }
  });

  it('referrals stage history is chronological and ends at current stage', () => {
    for (const r of mockReferrals) {
      const last = r.stageHistory[r.stageHistory.length - 1]!;
      expect(last.stage).toBe(r.stage);
    }
  });

  it('referral summary balances earned = pending + credited', () => {
    expect(mockReferralSummary.totalEarnedPaise).toBe(
      mockReferralSummary.pendingPaise + mockReferralSummary.creditedToWalletPaise,
    );
  });
});
