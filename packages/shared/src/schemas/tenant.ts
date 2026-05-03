import { z } from 'zod';

export const IndianPhoneSchema = z.string().regex(
  /^\+91[6-9]\d{9}$/,
  'Must be a valid Indian mobile number starting with +91',
);

export const IdTypeSchema = z.enum([
  'AADHAR',
  'PAN',
  'PASSPORT',
  'VOTER_ID',
  'DRIVING_LICENSE',
]);

export const CheckinSchema = z.object({
  name: z.string().min(2).max(200),
  phone: IndianPhoneSchema,
  email: z.string().email().optional(),
  property_id: z.string().uuid(),
  bed_id: z.string().uuid(),
  move_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  monthly_rent_paise: z.number().int().positive('Must be a positive integer (paise)'),
  advance_paise: z.number().int().min(0).optional(),
  id_type: IdTypeSchema,
  id_number: z.string().min(4).max(50),
  emergency_contact_name: z.string().min(2).max(200),
  emergency_contact_phone: IndianPhoneSchema,
  emergency_contact_relation: z.string().min(2).max(100),
});

export const CheckoutSchema = z.object({
  checkout_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remarks: z.string().max(500).optional(),
});

export type Checkin = z.infer<typeof CheckinSchema>;
export type Checkout = z.infer<typeof CheckoutSchema>;
