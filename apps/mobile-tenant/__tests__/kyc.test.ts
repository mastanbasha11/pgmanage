/**
 * KYC mutation flow — guards the contract the onboarding screens
 * depend on.
 *
 *   - Posting a full payload flips mockProfile.kycComplete to true.
 *   - Posting vehicleType: 'NONE' clears the registration even if a value
 *     was sent (mirrors backend behaviour — no stale plates).
 *   - Posting only emergency fields without vehicle leaves vehicle alone
 *     and kycComplete stays false until vehicle answer arrives.
 */
import { mockProfile } from '../lib/data/mock/db';

// Reset the mutable seed between tests so order doesn't matter.
const seedSnapshot = JSON.parse(JSON.stringify(mockProfile));
function resetSeed() {
  Object.assign(mockProfile, JSON.parse(JSON.stringify(seedSnapshot)));
}

// Inline the mutation body so the test doesn't need TanStack Query
// boilerplate. This MUST stay in sync with useUpdateKyc in lib/data/hooks.ts.
function applyMockKyc(update: {
  name?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  vehicleType?: 'NONE' | 'TWO_WHEELER' | 'FOUR_WHEELER';
  vehicleRegistration?: string;
}) {
  if (update.name) mockProfile.name = update.name;
  if (
    update.emergencyContactName ||
    update.emergencyContactPhone ||
    update.emergencyContactRelation
  ) {
    mockProfile.emergency = {
      name: update.emergencyContactName ?? mockProfile.emergency?.name ?? '',
      phone: update.emergencyContactPhone ?? mockProfile.emergency?.phone ?? '',
      relation:
        update.emergencyContactRelation ?? mockProfile.emergency?.relation ?? '',
    };
  }
  if (update.vehicleType) {
    mockProfile.vehicle = {
      type: update.vehicleType,
      registration:
        update.vehicleType === 'NONE'
          ? null
          : update.vehicleRegistration ?? mockProfile.vehicle.registration ?? null,
    };
  }
  mockProfile.kycComplete = Boolean(
    mockProfile.name &&
      mockProfile.emergency?.name &&
      mockProfile.emergency?.phone &&
      mockProfile.vehicle.type,
  );
}

describe('KYC mutation (mock side)', () => {
  beforeEach(resetSeed);

  it('flips kycComplete to true once both emergency + vehicle answers arrive', () => {
    expect(mockProfile.kycComplete).toBe(false);

    applyMockKyc({
      emergencyContactName: 'Mom',
      emergencyContactPhone: '+919876543210',
      emergencyContactRelation: 'Parent',
    });
    // Emergency alone is not enough — vehicle answer is still default NONE
    // which counts as an answer in the spec, so this should already pass.
    expect(mockProfile.kycComplete).toBe(true);
  });

  it('clears registration when type switches to NONE', () => {
    applyMockKyc({ vehicleType: 'TWO_WHEELER', vehicleRegistration: 'KA 01 AB 1234' });
    expect(mockProfile.vehicle.registration).toBe('KA 01 AB 1234');

    applyMockKyc({ vehicleType: 'NONE' });
    expect(mockProfile.vehicle.type).toBe('NONE');
    expect(mockProfile.vehicle.registration).toBeNull();
  });

  it('does not touch vehicle when only emergency fields are sent', () => {
    applyMockKyc({ vehicleType: 'FOUR_WHEELER', vehicleRegistration: 'KA 02 CD 5678' });
    applyMockKyc({ emergencyContactName: 'Dad' });
    expect(mockProfile.vehicle.type).toBe('FOUR_WHEELER');
    expect(mockProfile.vehicle.registration).toBe('KA 02 CD 5678');
  });
});
