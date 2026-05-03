import { z } from 'zod';
import { IndianPhoneSchema } from './tenant';

export const LeadStatusSchema = z.enum(['NEW', 'FOLLOW_UP', 'CONVERTED', 'LOST']);

export const LeadSourceSchema = z.enum([
  'WALK_IN',
  'REFERRAL',
  'FACEBOOK',
  'INSTAGRAM',
  'GOOGLE',
  'META_LEAD_AD',
  'OTHER',
]);

export const CreateLeadSchema = z.object({
  name: z.string().min(2).max(200),
  phone: IndianPhoneSchema,
  email: z.string().email().optional(),
  source: LeadSourceSchema,
  property_id: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
  next_followup_at: z.string().datetime().optional(),
});

export const LeadActivitySchema = z.object({
  lead_id: z.string().uuid(),
  activity_type: z.enum(['CALL', 'VISIT', 'WHATSAPP', 'NOTE', 'STATUS_CHANGE']),
  notes: z.string().min(1).max(1000),
  next_followup_at: z.string().datetime().optional(),
});

export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type CreateLead = z.infer<typeof CreateLeadSchema>;
export type LeadActivity = z.infer<typeof LeadActivitySchema>;
