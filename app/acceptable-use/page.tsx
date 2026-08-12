import LegalPage from '@/components/legal/LegalPage';
import { pageMetadata } from '@/lib/seo';

export const generateMetadata = () =>
  pageMetadata({
    title: 'Acceptable use policy',
    description: 'What is and is not permitted on the Compute Network.',
    path: '/acceptable-use',
    legacy: 'Acceptable Use Policy',
  });

export default function AcceptableUse() {
  return (
    <LegalPage title="Acceptable Use Policy" updated="10 AUGUST 2026">
      <p>
        This policy sets out what you may not do with the Compute Network. It forms part of the{' '}
        <a href="/terms">Terms of Service</a>. It applies to requesters and to anyone contributing compute.
      </p>

      <h2>1. Our position</h2>
      <p>
        This network is deliberately permissive. We do not apply a moral filter to your prompts, we do not
        refuse subjects because they are uncomfortable, and we do not log what you ask in order to police
        it. Adults are trusted to decide what they want a model to write for them.
      </p>
      <p>
        Permissive is not unlimited. The limits below are the ones that protect real people from harm, and
        they are not negotiable regardless of how the request is framed.
      </p>

      <h2>2. Absolutely prohibited</h2>
      <p><strong>Child sexual abuse material.</strong> Any attempt to generate, request, describe, or solicit sexual content involving minors is forbidden without exception. There is no artistic, fictional, research, or hypothetical framing that makes this acceptable. Requests are screened before dispatch, accounts are terminated immediately and permanently, and we report as required by law.</p>

      <h2>3. Also prohibited</h2>
      <ul>
        <li><strong>Sexual content involving real people who have not consented</strong>, including intimate imagery of identifiable individuals.</li>
        <li><strong>Targeting real people for harm</strong> &mdash; harassment campaigns, stalking, doxxing, or threats against an identifiable person.</li>
        <li><strong>Serious criminal facilitation</strong> &mdash; operational assistance in building weapons capable of mass casualties, whether chemical, biological, radiological, nuclear, or high-yield explosive.</li>
        <li><strong>Attacks on computer systems you do not own or have permission to test</strong>, including malware built for deployment against third parties.</li>
        <li><strong>Fraud and deception for gain</strong> &mdash; phishing, impersonating a real person or organisation to deceive, or generating material to defraud.</li>
        <li><strong>Content that is illegal where you are</strong>, or that you intend to distribute somewhere it is illegal.</li>
      </ul>

      <h2>4. Rules for contributors</h2>
      <p>If you run a worker, you must serve requests honestly. The following will cost you your ability to contribute:</p>
      <ul>
        <li>Returning fabricated, cached, or deliberately degraded output instead of running the model.</li>
        <li>Manipulating throughput measurement, latency reporting, or job accounting.</li>
        <li>Operating multiple identities to farm subsidies or evade a ban.</li>
        <li>Retaining, publishing, or attempting to attribute the prompt text you are given to process.</li>
      </ul>
      <p>Contributors receive prompt text in order to serve it. Treat it as confidential. It is not yours to keep.</p>

      <h2>5. How this is enforced</h2>
      <p>Enforcement is proportionate and deliberately narrow. We screen for the category in section 2 before a request is dispatched. Beyond that, we act on reports rather than surveillance &mdash; we are not reading your prompts looking for reasons to intervene, and the architecture is built so that we largely cannot.</p>
      <p>Where we do act, the response ranges from blocking a specific request, to suspending an account, to permanent termination and, where the law requires it, referral to the authorities. Workers accumulate strikes for integrity failures, and enough strikes permanently bars the account from contributing.</p>

      <h2>6. Reporting abuse</h2>
      <p>
        If you have seen something on this network that breaches this policy, report it to{' '}
        <a href="mailto:abuse@compute.tech">abuse@compute.tech</a>. Include enough detail to locate it.
        Reports about section 2 are treated as urgent.
      </p>
      <p>
        Copyright complaints should go to{' '}
        <a href="mailto:legal@compute.tech">legal@compute.tech</a> with the material identified, your
        contact details, and a statement of your good-faith belief that the use is unauthorised.
      </p>

      <h2>7. Changes</h2>
      <p>We may update this policy as the network grows and as we encounter cases we have not anticipated. Material changes will be announced in the application.</p>
    </LegalPage>
  );
}
