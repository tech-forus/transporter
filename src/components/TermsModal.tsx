import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, X } from "lucide-react";

// Canonical FreightCompare Terms & Conditions — same content shown to shippers
// (freight-compare-frontend/src/data/termsContent.tsx) and previously shown in
// the transporter parent-gate page before it was removed. Duplicated here
// because the transporter app is a separate deployment that can't import
// across repos; keep this in sync with the shipper-side copy if it changes.
interface TermsSection {
  title: string;
  content: React.ReactNode;
}

const termsSections: TermsSection[] = [
  {
    title: "1. Definitions",
    content: (
      <>
        <p>Capitalized terms used in these Terms shall have the following meanings unless otherwise specified:</p>
        <ul className="list-disc ml-5 mt-2 space-y-2">
          <li><strong>Account:</strong> A user profile created on the Platform for accessing services.</li>
          <li><strong>Content:</strong> Any data, information, text, images, files, rates, vendor details, or other materials uploaded, submitted, or displayed by Users on the Platform.</li>
          <li><strong>Data Fiduciary:</strong> As defined under the DPDPA, refers to Us as the entity determining the purpose and means of processing Personal Data.</li>
          <li><strong>Data Principal:</strong> As defined under the DPDPA, refers to You or any individual whose Personal Data is processed.</li>
          <li><strong>GST:</strong> Goods and Services Tax as per the GST Act, applicable at 18% for SaaS services unless otherwise specified.</li>
          <li><strong>Intermediary:</strong> As defined under Section 2(w) of the IT Act, the Platform acts as an intermediary facilitating user interactions without endorsing or modifying Content.</li>
          <li><strong>Personal Data:</strong> As defined under the DPDPA, any data about an identified or identifiable individual.</li>
          <li><strong>Platform:</strong> The FreightCompare.ai website (freightcompare.ai), mobile applications, and associated services for freight rate comparison, vendor onboarding, and related features.</li>
          <li><strong>Prohibited Activities:</strong> Activities listed in Section 6, including but not limited to illegal goods transport, GST fraud, and data scraping.</li>
          <li><strong>Services:</strong> Rate comparison, vendor uploading, serviceability checks, Excel imports/exports, UTSF engine access, and other features described in Section 4.</li>
          <li><strong>Synthetically Generated Information (SGI):</strong> As per the IT Rules 2026 amendments, any AI-generated or manipulated content, including deepfakes or altered rates.</li>
          <li><strong>User:</strong> Any individual or entity accessing the Platform, including Guests, Customers, Vendors, Admins, or Super Admins.</li>
          <li><strong>Vendor:</strong> A transporter or logistics provider onboarded on the Platform, including temporary/private vendors.</li>
        </ul>
      </>
    ),
  },
  {
    title: "2. Eligibility and Account Registration",
    content: (
      <div className="space-y-3">
        <p><strong>2.1 Eligibility:</strong> You must be at least 18 years old and capable of forming a legally binding contract under Indian law (Indian Contract Act, 1872). If representing an entity, You warrant full authorization.</p>
        <p><strong>2.2 Registration:</strong> To access certain Services, You must create an Account by providing accurate information, including company name, GSTIN, email, phone, and address. You agree to verify Your GSTIN via government APIs and comply with GST registration thresholds (₹20 lakhs annual turnover, or ₹10 lakhs for special category states).</p>
        <p><strong>2.3 Account Security:</strong> You are responsible for maintaining the confidentiality of Your login credentials. Notify Us immediately of any unauthorized access at [support@freightcompare.ai]. We are not liable for losses due to unauthorized use.</p>
        <p><strong>2.4 Verification:</strong> We may require OTP verification, GSTIN validation, or other checks. False information may lead to Account suspension.</p>
      </div>
    ),
  },
  {
    title: "3. Acceptance of Terms and Electronic Contracting",
    content: (
      <p>By clicking "I Agree" during signup or using the Platform, You electronically accept these Terms, which shall have the same legal effect as a physical signature under the IT Act (Section 10A on electronic contracts).</p>
    ),
  },
  {
    title: "4. Description of Services",
    content: (
      <>
        <p>The Platform provides B2B SaaS services for freight/logistics rate comparison in India, including:</p>
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>Rate calculation and comparison across vendors.</li>
          <li>Vendor onboarding flow for uploading transporters (public or temporary/private).</li>
          <li>UTSF (Unified Transporter Serviceability Framework) for pincode serviceability checks.</li>
          <li>Excel upload/download for box configurations, pricing matrices, and packing lists.</li>
          <li>Admin panels for vendor approval, user management, and form building.</li>
          <li>Subscription-based access (Starter, Pro, Enterprise plans) with token limits for calculations.</li>
          <li>Anomaly detection (Smart Shield) for quote fraud.</li>
        </ul>
        <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
          <p className="font-semibold">Important Disclaimer:</p>
          <p className="text-sm mt-1">The Platform does not facilitate actual bookings, shipments, or payments. All vendor contacts occur outside the Platform. Rates are user-contributed or integrated (e.g., Wheelseye FTL) and may not be real-time or guaranteed accurate. We do not endorse vendors or rates.</p>
        </div>
      </>
    ),
  },
  {
    title: "5. License and Access",
    content: (
      <div className="space-y-3">
        <p><strong>5.1 Grant of License:</strong> Subject to these Terms, We grant You a limited, non-exclusive, non-transferable, revocable license to access and use the Platform for Your internal business purposes.</p>
        <p><strong>5.2 Restrictions:</strong> You shall not: (a) reverse-engineer, decompile, or modify the Platform; (b) use for competitive purposes; (c) exceed subscription limits; or (d) automate scraping (prohibited under IT Act Section 43 on unauthorized access).</p>
        <p><strong>5.3 Service Levels:</strong> We aim for 99% uptime but provide no warranties. Downtime may occur for maintenance (notified in advance).</p>
      </div>
    ),
  },
  {
    title: "6. User Obligations and Prohibited Activities",
    content: (
      <div className="space-y-4">
        <div>
          <p><strong>6.1 User Obligations:</strong></p>
          <ul className="list-disc ml-5 mt-1 space-y-1">
            <li>Provide accurate, lawful Content (e.g., valid GSTINs, rates from legitimate sources).</li>
            <li>Comply with all laws, including GST filing, e-way bill generation, and transport regulations.</li>
            <li>Obtain necessary consents for uploading third-party data (e.g., vendor details) per DPDPA.</li>
            <li>Pay applicable fees and GST on subscriptions.</li>
            <li>Report suspicious activities via [report@freightcompare.ai].</li>
          </ul>
        </div>
        <div>
          <p><strong>6.2 Prohibited Activities:</strong> You shall not use the Platform for:</p>
          <ul className="list-disc ml-5 mt-1 space-y-1">
            <li>Uploading or comparing rates for illegal/prohibited goods (e.g., narcotics under NDPS Act, arms under Arms Act, hazardous waste under Hazardous Waste Rules, wildlife under Wildlife Protection Act).</li>
            <li>GST fraud, fake invoicing, shell entities, or bogus ITC claims (violating GST Act Sections 122-132).</li>
            <li>Onboarding fake vendors or manipulating rates for collusion/bid-rigging (antitrust under Competition Act, 2002).</li>
            <li>Data scraping, automated queries, or competitive intelligence gathering.</li>
            <li>Uploading SGI (e.g., AI-generated fake rates) without labeling, per IT Rules 2026.</li>
            <li>Criminal exploitation, such as smuggling routes, stolen goods transport, or money laundering (abetment under Bharatiya Nyaya Sanhita).</li>
            <li>Harassing, defamatory, or unlawful Content.</li>
            <li>Bypassing auth gates or spamming calculations.</li>
          </ul>
        </div>
        <p className="font-semibold text-red-600">Violation may result in immediate termination, Content removal, and reporting to authorities (e.g., GSTN, police).</p>
      </div>
    ),
  },
  {
    title: "7. Vendor Onboarding and User-Generated Content",
    content: (
      <div className="space-y-3">
        <p><strong>7.1 Onboarding Process:</strong> Vendors must provide accurate details (GSTIN, zones, pricing). We may verify but do not guarantee accuracy.</p>
        <p><strong>7.2 Temporary Transporters:</strong> User-uploaded private vendors are Your responsibility; We act as intermediary only.</p>
        <p><strong>7.3 Content Ownership:</strong> You retain ownership of Your Content but grant Us a perpetual, royalty-free license to use, store, and display it for Platform operations.</p>
        <p><strong>7.4 Moderation and Takedown:</strong> Per IT Rules, We exercise due diligence to prevent unlawful Content. We will remove prohibited Content within 3 hours of government/court orders or 36 hours of user complaints. Grievance Officer: [Name/Email, e.g., grievance@freightcompare.ai]. Annual user notifications on rules compliance.</p>
      </div>
    ),
  },
  {
    title: "8. Intellectual Property",
    content: (
      <div className="space-y-3">
        <p><strong>8.1 Our IP:</strong> The Platform, UTSF engine, designs, and trademarks are Our property, protected under Copyright Act, 1957, and Trademarks Act, 1999. No unauthorized use.</p>
        <p><strong>8.2 Infringement:</strong> Report IP claims to [ip@freightcompare.ai]. We comply with takedown notices per IT Act Section 79.</p>
      </div>
    ),
  },
  {
    title: "9. Fees, Payments, and GST Compliance",
    content: (
      <div className="space-y-3">
        <p><strong>9.1 Subscription Plans:</strong> As detailed on /pricing (e.g., Starter: ₹999/month, Pro: ₹2,499/quarterly). Tokens for calculations; overages charged extra.</p>
        <p><strong>9.2 Payments:</strong> Via integrated gateways (e.g., Razorpay). All fees exclusive of GST (18% for OIDAR services).</p>
        <p><strong>9.3 GST Obligations:</strong> You warrant GST compliance. We collect and remit GST for domestic users; foreign users may pay under Reverse Charge Mechanism (RCM). Invoices include GSTIN. Non-payment leads to suspension.</p>
        <p><strong>9.4 Refunds:</strong> No refunds except for technical errors, at Our discretion.</p>
      </div>
    ),
  },
  {
    title: "10. Data Protection and Privacy",
    content: (
      <div className="space-y-3 border-l-2 border-amber-200 pl-4">
        <p><strong>10.1 Compliance with DPDPA:</strong> We are a Data Fiduciary. Our Privacy Policy details Personal Data processing.</p>
        <p><strong>10.2 Consent and Notice:</strong> By using the Platform, You consent to processing Personal Data for Services. Notices per DPDPA Section 5: (i) Data collected (e.g., GSTIN, pincodes); (ii) Purposes (rate comparison, analytics); (iii) Rights (access, correction, erasure under Sections 11-13). Access in English or Eighth Schedule languages.</p>
        <p><strong>10.3 Data Security:</strong> We implement technical measures (e.g., encryption) per DPDPA Section 8. Breaches notified within 72 hours.</p>
        <p><strong>10.4 Data Processors:</strong> Engaged via valid contracts; no unauthorized sub-processing.</p>
        <p><strong>10.5 Transfers:</strong> No transfers to restricted countries per DPDPA Section 16. Use India-standard clauses for cross-border.</p>
        <p><strong>10.6 Rights:</strong> Exercise via [dpo@freightcompare.ai]. Complaints to Data Protection Board.</p>
        <p><strong>10.7 Data Retention:</strong> As per IT Rules (180 days for logs); delete upon request unless legally required.</p>
      </div>
    ),
  },
  {
    title: "11. Intermediary Status and Limitations",
    content: (
      <div className="space-y-3">
        <p><strong>11.1 Safe Harbor:</strong> Per IT Act Section 79 and IT Rules, We are an intermediary and not liable for User Content, provided We observe due diligence (e.g., no initiation/modification of Content, prompt takedowns).</p>
        <p><strong>11.2 No Warranties:</strong> Services "as-is." No guarantees on rate accuracy, vendor performance, or savings. Disclaim liability for external transactions.</p>
      </div>
    ),
  },
  {
    title: "12. Limitation of Liability",
    content: (
      <p>To the fullest extent permitted by law, We shall not be liable for indirect, consequential, or punitive damages, including loss of profits, data, or business opportunities. Liability capped at fees paid in the preceding 12 months. No liability for force majeure (e.g., strikes, natural disasters).</p>
    ),
  },
  {
    title: "13. Indemnification",
    content: (
      <p>You agree to indemnify Us against claims arising from Your breach of Terms, unlawful Content, GST non-compliance, or misuse (including legal fees).</p>
    ),
  },
  {
    title: "14. Termination",
    content: (
      <div className="space-y-3">
        <p><strong>14.1 By Us:</strong> For breach, non-payment, or legal requirements, with/without notice.</p>
        <p><strong>14.2 By You:</strong> Cancel subscription anytime; no refunds for partial periods.</p>
        <p><strong>14.3 Effects:</strong> Upon termination, access revoked; data deleted per retention policy.</p>
      </div>
    ),
  },
  {
    title: "15. Governing Law and Dispute Resolution",
    content: (
      <div className="space-y-3">
        <p><strong>15.1 Governing Law:</strong> Laws of India, without conflict principles.</p>
        <p><strong>15.2 Jurisdiction:</strong> Exclusive jurisdiction of courts in Delhi, India.</p>
        <p><strong>15.3 Arbitration:</strong> Disputes resolved via arbitration under Arbitration and Conciliation Act, 1996 (as amended), in Delhi, by a sole arbitrator appointed by Us. English language; costs to losing party.</p>
        <p><strong>15.4 Grievances:</strong> Contact Grievance Officer per IT Rules.</p>
      </div>
    ),
  },
  {
    title: "16. Miscellaneous",
    content: (
      <div className="space-y-3">
        <p><strong>16.1 Severability:</strong> Invalid provisions severed; remainder enforceable.</p>
        <p><strong>16.2 Amendments:</strong> Posted on Platform; binding after 15 days.</p>
        <p><strong>16.3 Assignment:</strong> We may assign rights; You may not without consent.</p>
        <p><strong>16.4 Entire Agreement:</strong> Supersedes prior agreements.</p>
        <p><strong>16.5 Force Majeure:</strong> No liability for delays beyond control.</p>
        <p><strong>16.6 Notices:</strong> Via email or Platform.</p>
        <p><strong>16.7 Waiver:</strong> No waiver unless written.</p>
        <p><strong>16.8 Contact:</strong> For questions, email [support@freightcompare.ai].</p>
      </div>
    ),
  },
  {
    title: "Final Declaration",
    content: (
      <div className="mt-4 p-4 bg-slate-100 rounded-lg text-sm text-slate-700">
        <p>By using the Platform, You acknowledge reading and agreeing to these Terms. For Super Admins/Admins: Additional role-specific terms apply (e.g., hardcoded email checks for access).</p>
        <p className="mt-3 font-semibold">FreightCompare.ai</p>
      </div>
    ),
  },
];

interface TermsModalProps {
  open: boolean;
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ open, onClose }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              <FileText className="text-amber-500 flex-shrink-0" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Terms & Conditions</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-5 text-sm text-slate-700 px-6 py-5 overflow-y-auto">
            <div className="space-y-3 pb-2 border-b border-slate-100">
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
                Effective Date: February 20, 2026<br />
                Last Updated: February 20, 2026
              </p>
              <p>
                These Terms and Conditions ("Terms," "T&amp;C," or "Agreement") govern your access to and use of the FreightCompare.ai platform (the "Platform"), including any websites, applications, APIs, or services provided by FreightCompare.ai (hereinafter referred to as "We," "Us," "Our," or the "Company"), with its registered office at [Insert Registered Office Address, e.g., Okhla Phase 1, Delhi NCR, India].
              </p>
              <p>
                By accessing, registering for, or using the Platform, you ("User," "You," or "Your") agree to be bound by these Terms, our Privacy Policy, Acceptable Use Policy, and any other policies incorporated herein by reference. If You are accessing the Platform on behalf of an entity (e.g., a company or organization), You represent and warrant that You have the authority to bind that entity to these Terms.
              </p>
              <div>
                <p className="mb-2">These Terms are drafted in compliance with applicable Indian laws, including but not limited to:</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li>The Information Technology Act, 2000 (as amended) ("IT Act");</li>
                  <li>The Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 (as amended through 2026, including amendments on synthetically generated information ("SGI"), 3-hour takedown requirements, and due diligence obligations) ("IT Rules");</li>
                  <li>The Digital Personal Data Protection Act, 2023 ("DPDPA");</li>
                  <li>The Goods and Services Tax Act, 2017 ("GST Act");</li>
                  <li>The Carriage by Road Act, 2007;</li>
                  <li>The Motor Vehicles Act, 1988 (as amended);</li>
                  <li>The Consumer Protection Act, 2019 (to the extent applicable to B2B services);</li>
                  <li>Relevant provisions of the Bharatiya Nyaya Sanhita, 2023 (Indian Penal Code equivalent) on abetment, fraud, and criminal misuse; and</li>
                  <li>Other regulatory frameworks governing logistics, data protection, and electronic commerce in India.</li>
                </ul>
              </div>
              <p className="font-medium text-slate-800 border-l-2 border-amber-500 pl-3">
                If You do not agree with any part of these Terms, You must not access or use the Platform. We reserve the right to amend these Terms at any time, with notice provided via the Platform or email. Continued use after amendments constitutes acceptance.
              </p>
            </div>

            {termsSections.map((sec) => (
              <section key={sec.title}>
                <h3 className="font-bold text-slate-900 mb-1">{sec.title}</h3>
                <div className="leading-relaxed text-slate-600">{sec.content}</div>
              </section>
            ))}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default TermsModal;
