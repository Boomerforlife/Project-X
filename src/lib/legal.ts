/**
 * Business facts used by the legal pages (Terms, Privacy, Refund, Contact). Fill these in here, once.
 * Never invent them: an empty value renders as a visible [TO FILL] marker, and while any REQUIRED value is empty
 * the pages show a "Draft" banner and stay noindex.
 */
export const LEGAL = {
  /** Who runs the service: a registered company/LLP name, or "<Full name> (sole proprietor)". */
  operator: "FIFO (First In First Out Studio)",
  /** Legal status, shown after the operator name. */
  status: "FIFO is not yet a registered company; it plans to register as a private limited company.",
  /** Where the business is based (city/state/country is enough; a full street address is optional). */
  address: "India",
  /** Optional: company CIN / LLPIN. Leave empty if not registered. */
  cin: "",
  /** Optional: GSTIN. Leave empty if not registered for GST. */
  gstin: "",
  /** Support inbox shown on every page. */
  supportEmail: "firstinfirstoutstudio@gmail.com",
  /** Optional support phone. */
  phone: "",
  /** Grievance officer name (optional for now; add a named person once registered). Can be the founder. */
  grievanceOfficer: "",
  grievanceEmail: "firstinfirstoutstudio@gmail.com",
  /** Optional: city whose courts have jurisdiction. Empty = "courts in India". */
  courtsCity: "",
  /** When the service started. */
  established: "November 2026",
  /** Date the current version takes effect, e.g. "20 November 2026". */
  effectiveDate: "November 2026",
  /** Full refund on request within this many days of purchase. */
  refundWindowDays: 5,
  /** Grievances are resolved within this many days. */
  grievanceResponseDays: 15,
} as const;

export type LegalKey = keyof typeof LEGAL;

const REQUIRED: LegalKey[] = ["operator", "supportEmail", "grievanceEmail", "effectiveDate", "refundWindowDays"];

export const LEGAL_COMPLETE = REQUIRED.every((k) => Boolean(LEGAL[k]));
