import type { AgeGroup, LeadSource, LeadStage, LeadType } from '../db/types';

export interface QualificationInput {
  leadType: LeadType;
  source: LeadSource;
  hasEmail: boolean;
  hasPhone: boolean;
  consentContact: boolean;
  serviceInterest?: string | null;
  ageGroup?: AgeGroup | null;
  details?: string | null;
  isGuardian?: boolean;
  preferredTimesGiven?: boolean;
}

export interface Qualification {
  score: number;
  isQualified: boolean;
  priority: 'high' | 'normal' | 'low';
  stage: LeadStage;
  needsAttention: boolean;
  attentionReason: string | null;
  reasons: string[];
}

const URGENCY = /\b(asap|urgent|this week|next week|soon|immediately|pre-?season|trial|trials|selection|tryout)\b/i;

/**
 * Transparent, rule-based lead qualification (no black box).
 * A lead is "qualified" when ASPARC can contact them (consent + a contact
 * method) and the enquiry is specific enough to act on.
 */
export function qualifyLead(i: QualificationInput): Qualification {
  const reasons: string[] = [];
  let score = 0;

  if (i.consentContact && (i.hasEmail || i.hasPhone)) {
    score += 35;
    reasons.push('Contactable with consent');
  }
  if (i.hasEmail && i.hasPhone) {
    score += 10;
    reasons.push('Email and phone provided');
  }
  if (i.serviceInterest || !['general', 'complaint'].includes(i.leadType)) {
    score += 20;
    reasons.push('Specific service interest');
  }
  if (i.leadType === 'academy' && i.ageGroup) {
    score += 10;
    reasons.push('Academy age group identified');
  }
  if (i.leadType === 'academy' && i.isGuardian) {
    score += 5;
    reasons.push('Parent/guardian enquiry');
  }
  if (i.leadType === 'club_partnership') {
    score += 20;
    reasons.push('Club partnership opportunity');
  }
  if (i.leadType === 'booking' || i.preferredTimesGiven) {
    score += 15;
    reasons.push('Booking intent');
  }
  if (i.details && i.details.trim().length >= 20) {
    score += 5;
    reasons.push('Detailed enquiry');
  }
  if (i.details && URGENCY.test(i.details)) {
    score += 10;
    reasons.push('Time-sensitive');
  }
  score = Math.min(100, score);

  const contactable = i.consentContact && (i.hasEmail || i.hasPhone);
  const isComplaint = i.leadType === 'complaint';
  const isQualified = contactable && !isComplaint && score >= 60;

  let priority: Qualification['priority'] = 'normal';
  if (isComplaint || i.leadType === 'club_partnership' || score >= 80) priority = 'high';
  else if (score < 40) priority = 'low';

  const stage: LeadStage = i.leadType === 'booking' || i.preferredTimesGiven ? 'booking_requested' : 'new_enquiry';

  let attentionReason: string | null = null;
  if (isComplaint) attentionReason = 'Complaint – management response required';
  else if (i.leadType === 'club_partnership') attentionReason = 'Club partnership enquiry';

  return { score, isQualified, priority, stage, needsAttention: attentionReason !== null, attentionReason, reasons };
}
