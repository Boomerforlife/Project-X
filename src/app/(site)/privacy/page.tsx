import { PageHeader } from "@/components/layout/PageHeader";
import { Fact, LegalBody, LegalSection, OperatorLine } from "@/components/legal/Legal";
import { LEGAL, LEGAL_COMPLETE } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

// Not indexed until every business fact in src/lib/legal.ts is filled in.
export const metadata = pageMetadata({
  title: "Privacy policy",
  description: `How ${SITE.name} collects, uses and protects your data.`,
  path: "/privacy/",
  noindex: !LEGAL_COMPLETE,
});

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Privacy policy", path: "/privacy/" },
        ]}
        eyebrow="Legal"
        title="Privacy policy"
        lede="What we collect, why, who sees it, and the choices you have."
      />
      <LegalBody>
        <LegalSection title="Who is responsible">
          <p>
            {SITE.name} ({SITE.url.replace(/^https?:\/\//, "")}) is run by <OperatorLine /> We decide how your personal
            data is used, so under India&apos;s Digital Personal Data Protection Act, 2023 we are the &quot;data
            fiduciary&quot;.
          </p>
        </LegalSection>

        <LegalSection title="What we collect">
          <ul>
            <li>
              <strong className="text-fg">Account:</strong> your email address. If you sign in with Google, we also
              receive the name and profile photo link on your Google account. We never see your Google password.
            </li>
            <li>
              <strong className="text-fg">Profile:</strong> display name, target exam, class and daily goal, as you
              enter them during onboarding.
            </li>
            <li>
              <strong className="text-fg">Study activity:</strong> practice and test attempts, your answers, time taken,
              bookmarks, review list, mistake notebook and study plans.
            </li>
            <li>
              <strong className="text-fg">Purchases:</strong> order id, plan, amount, status, dates and Razorpay
              reference ids. Card, UPI and bank details go straight to Razorpay; we never receive or store them.
            </li>
            <li>
              <strong className="text-fg">Rewards:</strong> if you choose to watch a rewarded ad, which reward you
              claimed and when, so we can apply daily and monthly limits.
            </li>
            <li>
              <strong className="text-fg">Messages:</strong> what you send us when you contact support or report a
              question.
            </li>
            <li>
              <strong className="text-fg">Technical logs:</strong> our servers record each request (IP address, browser
              type, time, page) for security and fixing faults. These logs are deleted after about 30 days.
            </li>
          </ul>
          <p>We do not ask for your date of birth, phone number, school or location.</p>
        </LegalSection>

        <LegalSection title="Why we use it">
          <ul>
            <li>To run your account and save your progress, answers and lists.</li>
            <li>To show your results, progress and mistakes back to you.</li>
            <li>To sell and apply Plus passes, and to handle refunds.</li>
            <li>To answer support requests and fix reported questions.</li>
            <li>To keep the service secure and stop abuse, fraud and scraping.</li>
          </ul>
          <p>We do not sell your personal data, and we do not use it to build advertising profiles.</p>
        </LegalSection>

        <LegalSection title="Cookies, browser storage and analytics">
          <p>
            Your sign-in session and preferences such as the colour theme are kept in your browser&apos;s local storage,
            not in cookies. Signing out clears the session.
          </p>
          <p>
            Our own analytics only count events per day (for example, how many practice sessions were completed). They
            store no user id, no IP address and no cookie, and they are switched off when your browser sends Do Not
            Track or Global Privacy Control.
          </p>
        </LegalSection>

        <LegalSection title="Advertising">
          <p>
            Free accounts may see a small number of ads from Google AdSense, only at the end of pages and between list
            items. We never show ads during a question, practice session, test or CBT, or on sign-in, payment and
            account pages. Plus passes remove ads.
          </p>
          <p>
            Google, as a third-party vendor, uses cookies and similar identifiers to serve ads on this site, to limit
            how often you see the same ad, to measure ads and to prevent fraud. Because many of our users are students
            under 18, we ask Google for <strong className="text-fg">non-personalised ads</strong> only: ads are chosen
            from the page you are on, not from your browsing history, and no interest profile is built from your visits
            here. You can read how Google uses data from sites that use its services at{" "}
            <a href="https://policies.google.com/technologies/partner-sites" rel="noopener noreferrer" target="_blank">
              policies.google.com/technologies/partner-sites
            </a>{" "}
            and manage Google ad settings at{" "}
            <a href="https://myadcenter.google.com/" rel="noopener noreferrer" target="_blank">
              myadcenter.google.com
            </a>
            .
          </p>
          <p>
            Rewarded ads are optional. If you choose to watch one, it is served by Google Ad Manager, and Google tells
            your browser when it has finished; we then record the reward described above.
          </p>
        </LegalSection>

        <LegalSection title="AI">
          <p>
            Some solutions and explanations are drafted with Google&apos;s Gemini models from the question text alone.
            Your personal data, answers and account details are not sent to any AI model.
          </p>
        </LegalSection>

        <LegalSection title="Who we share it with">
          <p>Only the service providers we need to run {SITE.name}, each under its own data protection terms:</p>
          <ul>
            <li>Supabase: database and sign-in (stored in Mumbai, India).</li>
            <li>Google Cloud and Firebase Hosting: website and API servers (Mumbai, India) and server logs.</li>
            <li>Google: Sign in with Google, if you use it, and ads for free accounts.</li>
            <li>Razorpay: payments and refunds.</li>
          </ul>
          <p>
            We also disclose data when Indian law requires it, for example on a valid order from a court or a government
            authority.
          </p>
        </LegalSection>

        <LegalSection title="How long we keep it">
          <ul>
            <li>Account, profile and study activity: while your account exists.</li>
            <li>
              When you ask us to delete your account, we delete this data within 30 days, except what the law requires
              us to keep.
            </li>
            <li>Purchase records: as long as Indian tax and accounting laws require.</li>
            <li>Server logs: about 30 days.</li>
          </ul>
        </LegalSection>

        <LegalSection title="Children and students under 18">
          <p>
            {SITE.name} is built for JEE and NEET students, and many of them are under 18. If you are under 18, a parent
            or guardian must agree to you using {SITE.name} and to this policy before you create an account, and a
            parent or guardian should make any purchase.
          </p>
          <p>
            In line with the Digital Personal Data Protection Act, 2023, we do not track or behaviourally monitor
            children and we do not target ads at them. A parent or guardian can ask us at any time to see, correct or
            delete their child&apos;s data, by writing to <Fact k="supportEmail" label="Support email" />.
          </p>
        </LegalSection>

        <LegalSection title="How we protect it">
          <p>
            All traffic is encrypted (HTTPS). Access to the database is restricted to the service and a small number of
            administrators, and every account can only read its own data. Payment details never reach our servers. No
            system is perfectly secure; if a breach affects you, we will tell you and the authorities as the law
            requires.
          </p>
        </LegalSection>

        <LegalSection title="Your rights">
          <p>You can ask us to:</p>
          <ul>
            <li>give you a summary of the personal data we hold about you and who we shared it with,</li>
            <li>correct or complete inaccurate data,</li>
            <li>delete your account and data,</li>
            <li>withdraw consent (you can then no longer use the parts of the service that need it),</li>
            <li>nominate someone to exercise these rights if you die or cannot act.</li>
          </ul>
          <p>
            Write to <Fact k="supportEmail" label="Support email" /> from your account email. If you are not satisfied,
            contact our grievance officer{LEGAL.grievanceOfficer ? <> ({LEGAL.grievanceOfficer})</> : null} at{" "}
            <Fact k="grievanceEmail" label="Grievance officer email" />. We resolve grievances within{" "}
            {LEGAL.grievanceResponseDays} days. If we do not resolve it, you may complain to the Data Protection Board
            of India.
          </p>
        </LegalSection>

        <LegalSection title="Changes">
          <p>
            If we change this policy, we will update the effective date above, and tell you in the app or by email
            before a significant change takes effect.
          </p>
        </LegalSection>
      </LegalBody>
    </>
  );
}
