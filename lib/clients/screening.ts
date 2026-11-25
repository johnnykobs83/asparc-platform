/**
 * The pre-visit form's questions. Shared by the public form and the dashboard,
 * so this file must stay free of server-only imports.
 *
 * The screening questions follow the structure of a standard adult pre-exercise
 * screen (ESSA's Adult Pre-Exercise Screening System, stage 1) plus the usual
 * remedial-massage contraindications. The wording is ASPARC's own. Any "yes"
 * means a staff member reviews the form before the session, and GP clearance
 * may be needed.
 */

export const SCREENING_QUESTIONS = [
  { key: 'heart', text: 'Has a doctor ever told you that you have a heart condition, or have you ever had a stroke?' },
  { key: 'chest_pain', text: 'Do you get pain, tightness or discomfort in your chest, either at rest or when you are active?' },
  { key: 'dizziness', text: 'Do you ever faint, feel dizzy or lose your balance (not counting light-headedness from breathing hard)?' },
  { key: 'asthma', text: 'In the last 12 months, have you had an asthma attack that needed medical attention?' },
  { key: 'diabetes', text: 'If you have diabetes, have you had trouble keeping your blood sugar under control in the last 3 months?' },
  { key: 'other_condition', text: 'Do you have any other medical condition that could make physical activity risky for you?' },
  { key: 'musculoskeletal', text: 'Do you have a muscle, bone or joint problem or a recent injury, or have you had surgery in the last 12 months?' },
  { key: 'pregnancy', text: 'Are you pregnant, or have you given birth in the last 12 months?' },
  { key: 'massage', text: 'Do you have a skin condition or infection, unexplained bruising, varicose veins or a history of blood clots, or do you take blood-thinning medicine?' },
  { key: 'doctor_advice', text: 'Has a doctor told you to exercise only under supervision, or not to exercise at all?' },
] as const;

export type ScreeningKey = (typeof SCREENING_QUESTIONS)[number]['key'];

export const HEARD_ABOUT = [
  ['google', 'Google or another search'],
  ['social', 'Instagram, Facebook or other social media'],
  ['friend', 'A friend or family member'],
  ['club', 'My club or school'],
  ['coach', 'My coach'],
  ['health_referral', 'A doctor, physio or other health professional'],
  ['other', 'Something else'],
] as const;

export const CONSENT_HEALTH_TEXT =
  'I agree to ASPARC collecting and using the health information in this form so it can provide its services safely. It is only seen by the ASPARC team members involved in my care, as set out in the Privacy Policy.';
export const CONSENT_RISK_TEXT =
  'The information I have given is true and complete as far as I know. I understand that exercise, testing and massage carry some risk of injury, that I should tell ASPARC if anything changes, and that I may be asked to get clearance from my doctor first.';
export const CONSENT_MARKETING_TEXT = 'Send me occasional news, programs and offers from ASPARC. I can unsubscribe at any time.';

/** What staff see for a form, without any health detail. */
export type FormFlag = 'missing' | 'sent' | 'needs_review' | 'cleared' | 'not_cleared' | 'complete' | 'expired';

export const FLAG_LABEL: Record<FormFlag, string> = {
  missing: 'No form yet',
  sent: 'Form sent – waiting',
  needs_review: 'GP clearance needed',
  cleared: 'Cleared',
  not_cleared: 'Not cleared',
  complete: 'Form complete',
  expired: 'Form out of date',
};

export const FLAG_TONE: Record<FormFlag, 'neutral' | 'blue' | 'amber' | 'green' | 'red'> = {
  missing: 'neutral',
  sent: 'blue',
  needs_review: 'amber',
  cleared: 'green',
  not_cleared: 'red',
  complete: 'green',
  expired: 'amber',
};
