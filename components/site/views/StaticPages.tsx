import { BRAND, IMAGES } from '@/lib/brand';
import type { PublicSiteData } from '@/lib/kb/service';
import { LEGAL_STATUS } from '@/lib/legal';
import { PageHero, Section } from '../ui';
import { ContactForms } from './ContactView';

export function ContactView({ site }: { site: PublicSiteData }) {
  const services = site.services.filter((s) => s.availability !== 'unavailable').map((s) => ({ name: s.name, category: s.category }));
  return (
    <>
      <PageHero eyebrow="Contact us" title={<>Let&apos;s get <span className="text-sky">started.</span></>} intro="Send an enquiry, request a booking, register for the Academy or talk to us about a club partnership. The ASPARC team will respond directly." image={IMAGES.hero} />
      <Section>
        <div className="grid gap-12 lg:grid-cols-12">
          <aside className="space-y-6 lg:col-span-4">
            <div className="card p-7">
              <h2 className="eyebrow text-royal">Location</h2>
              <p className="mt-2 text-[15px]">{site.location.address || site.location.text}</p>
            </div>
            <div className="card p-7">
              <h2 className="eyebrow text-royal">Hours</h2>
              <p className="mt-2 text-[15px]">{site.hours.text}</p>
            </div>
            {(site.contact.phone || site.contact.email) && (
              <div className="card p-7">
                <h2 className="eyebrow text-royal">Direct</h2>
                {site.contact.phone && <p className="mt-2"><a className="font-semibold text-royal" href={`tel:${site.contact.phone.replace(/\s/g, '')}`}>{site.contact.phone}</a></p>}
                {site.contact.email && <p className="mt-1"><a className="font-semibold text-royal" href={`mailto:${site.contact.email}`}>{site.contact.email}</a></p>}
              </div>
            )}
            <div className="rounded-[var(--radius-card)] bg-charcoal p-7 text-white">
              <h2 className="eyebrow">Prefer to chat?</h2>
              <p className="mt-2 text-[15px] text-white/75">ASPARC AI answers common questions 24/7 and passes your enquiry straight to the team. Use the chat button at the bottom of the screen.</p>
            </div>
            <p className="text-xs leading-relaxed text-muted">In an emergency call 000. ASPARC does not provide medical advice through this website.</p>
          </aside>
          <div className="card p-6 sm:p-8 lg:col-span-8">
            <ContactForms services={services} />
          </div>
        </div>
      </Section>
    </>
  );
}

function LegalNotice() {
  if (LEGAL_STATUS.reviewed) return null;
  return (
    <p className="mb-8 rounded-md border border-warn/30 bg-[#fff6e8] px-4 py-3 text-sm text-warn">
      This document is a draft prepared for ASPARC’s launch and is pending professional legal review.
    </p>
  );
}

export function PrivacyView({ site }: { site: PublicSiteData }) {
  const email = site.contact.email;
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy Policy" intro={`How ${BRAND.name} collects, uses and protects your personal information.`} image={IMAGES.about} />
      <Section>
        <article className="prose-asparc mx-auto max-w-3xl">
          <LegalNotice />
          <p><strong>Last updated:</strong> {LEGAL_STATUS.updated}</p>
          <p>{BRAND.name} ({BRAND.fullName}) respects your privacy. This policy explains how we handle personal information in line with the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs).</p>
          <h2>Information we collect</h2>
          <ul>
            <li>Contact details you provide – name, email address, phone number and preferred contact method.</li>
            <li>Enquiry details – the service you are interested in, preferred session times, and any message you send.</li>
            <li>For the Performance Academy – the parent or guardian’s details, and the athlete’s name and age group.</li>
            <li>For club partnerships – club name, your role and approximate number of athletes.</li>
            <li>Website chat conversations with ASPARC AI.</li>
            <li>Your consent choices (consent to be contacted and, separately, any marketing opt-in).</li>
          </ul>
          <p>We do not ask for medical or health information through our website forms or chat. Please do not include it. Where health information becomes relevant to your training, we will discuss it with you directly and only collect what is reasonably necessary, with your consent.</p>
          <h2>How we use it</h2>
          <ul>
            <li>To respond to your enquiry, booking request, registration or partnership enquiry.</li>
            <li>To manage our relationship with you and deliver services you engage us for.</li>
            <li>To send news and program updates – only if you have opted in. You can unsubscribe at any time.</li>
            <li>To maintain records, improve our services and meet legal obligations.</li>
          </ul>
          <h2>Children and young athletes</h2>
          <p>For athletes under 18, we communicate with, and obtain consent from, a parent or guardian. Academy registrations must be completed by a parent or guardian. We collect only the minimum information about young athletes needed to run the program.</p>
          <h2>ASPARC AI (website chat)</h2>
          <p>Our website chat is an AI assistant, not a person. Conversations are recorded so our team can follow up and improve the service. The assistant does not provide medical advice and cannot confirm bookings or payments. Please do not share payment card or medical details in chat – card numbers are automatically removed.</p>
          <h2>Who we share information with</h2>
          <p>We do not sell your personal information. We use trusted service providers to operate our business, which may store or process information on our behalf, including outside Australia:</p>
          <ul>
            <li>Website hosting and database services</li>
            <li>Customer relationship management (CRM) software</li>
            <li>Email delivery services</li>
            <li>AI service providers that generate chat responses</li>
            <li>Payment processors, when online payment is introduced</li>
          </ul>
          <p>We take reasonable steps to ensure these providers protect your information consistently with the APPs.</p>
          <h2>Security</h2>
          <p>We use access-controlled systems, encryption in transit and role-based staff access to protect your information. Only authorised staff can view enquiry records.</p>
          <h2>Access, correction and deletion</h2>
          <p>You can ask to access or correct the personal information we hold about you, or ask us to delete it, by contacting us{email ? <> at <a href={`mailto:${email}`}>{email}</a></> : ' through our contact form'}. We will respond within a reasonable time.</p>
          <h2>Complaints</h2>
          <p>If you have a privacy concern, please contact us first so we can try to resolve it. If you are not satisfied, you can contact the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au.</p>
        </article>
      </Section>
    </>
  );
}

export function TermsView({ site }: { site: PublicSiteData }) {
  const cancellation = site.kb['policy.cancellation'];
  return (
    <>
      <PageHero eyebrow="Legal" title="Terms & Conditions" intro={`The terms that apply when you use the ${BRAND.name} website and services.`} image={IMAGES.about} />
      <Section>
        <article className="prose-asparc mx-auto max-w-3xl">
          <LegalNotice />
          <p><strong>Last updated:</strong> {LEGAL_STATUS.updated}</p>
          <h2>1. About these terms</h2>
          <p>These terms apply to your use of this website and to services provided by {BRAND.name} ({BRAND.fullName}). By using the website or our services you agree to them. Nothing in these terms excludes rights you have under the Australian Consumer Law.</p>
          <h2>2. Enquiries, bookings and registrations</h2>
          <p>Submitting an enquiry, booking request or Academy registration through this website or ASPARC AI is a <strong>request only</strong>. A session, program place or appointment is confirmed only when a member of the ASPARC team confirms it with you directly.</p>
          <h2>3. Pricing</h2>
          <p>Prices shown as “draft” are indicative and subject to confirmation. The price that applies is the price confirmed with you before you commit to a service.</p>
          <h2>4. Payments</h2>
          <p>Online payment is not yet available. When introduced, payments will be processed by a secure third-party payment provider. ASPARC never asks for card details through chat, email or enquiry forms.</p>
          <h2>5. Cancellations and refunds</h2>
          <p>{cancellation?.status === 'approved' ? cancellation.content : 'Our cancellation and refund policy is being finalised and will be provided to you before you commit to any paid service.'}</p>
          <h2>6. Health, safety and participation</h2>
          <ul>
            <li>Physical training involves some risk of injury. You should tell us about any health condition or injury that may affect your participation before you start training.</li>
            <li>ASPARC does not diagnose injuries or medical conditions, provide physiotherapy, or prescribe medical treatment. Return-to-performance training is exercise-based and should be undertaken with clearance from, or alongside, your treating practitioner.</li>
            <li>Follow coaching instructions and stop and tell your coach if you feel pain or unwell.</li>
          </ul>
          <h2>7. Junior athletes</h2>
          <p>A parent or guardian must register athletes under 18 and is responsible for providing accurate information and consents.</p>
          <h2>8. ASPARC AI</h2>
          <p>ASPARC AI is an automated assistant. Its answers are general information about ASPARC, are not professional or medical advice, and may occasionally be incomplete. It cannot confirm bookings, registrations or payments.</p>
          <h2>9. Website content</h2>
          <p>Website content is provided for general information. We aim to keep it accurate and up to date but it may change without notice.</p>
          <h2>10. Liability</h2>
          <p>To the extent permitted by law, ASPARC is not liable for indirect or consequential loss arising from use of this website. Our liability for services is limited to the remedies available under the Australian Consumer Law.</p>
          <h2>11. Governing law</h2>
          <p>These terms are governed by the laws of Victoria, Australia.</p>
        </article>
      </Section>
    </>
  );
}
