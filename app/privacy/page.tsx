import LegalPage from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Privacy Policy — Compute Network',
  description: 'What Compute Network Inc. collects, what it does not, and why.',
};

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" updated="10 AUGUST 2026">
      <p>
        This policy describes how <strong>Compute Network Inc.</strong> (&ldquo;Compute Network&rdquo;,
        &ldquo;we&rdquo;) handles information when you use our website, API, and network. It is written to
        describe what the software actually does. Where a practice is less private than you might
        assume, we say so rather than leave it out.
      </p>

      <h2>1. The short version</h2>
      <ul>
        <li><strong>Text prompts and responses are not stored.</strong> They exist in memory for the life of the request and are discarded when it completes. No database table holds them.</li>
        <li><strong>Image prompts are stored</strong>, are linked to your account, and by default appear on a public gallery. This is the one place where the service is less private than the text side. See section 4.</li>
        <li><strong>Prompts are not end-to-end encrypted.</strong> They are protected by TLS in transit, but our orchestrator processes them in readable form in order to route them.</li>
        <li><strong>We do not sell personal information</strong> and we do not use your prompts to train models.</li>
      </ul>

      <h2>2. What we collect</h2>
      <p><strong>Account information.</strong> Authentication is handled by Privy. We store the identifier Privy issues you, and, depending on how you sign in, your wallet address and your X (Twitter) username and account ID. We do not receive or store your X password.</p>
      <p><strong>Usage and billing records.</strong> For each completed job we retain metadata only: an internal job identifier, which account requested it, which worker served it, the model and tier, the number of tokens generated, how long it took, and when it finished. Credit purchases, balances, transaction records, API keys and per-key usage counts are also stored, because they are what your bill is computed from.</p>
      <p><strong>Network abuse signals.</strong> We store a <em>hash</em> of your IP address together with a per-day request count. We do not retain raw IP addresses in the application database. This exists solely to enforce rate limits and detect abuse.</p>
      <p><strong>Worker information.</strong> If you contribute compute, we additionally store your worker identity and access token, hardware and throughput statistics, a reputation and strike record used to detect fraudulent workers, your earnings, and the wallet address you are paid to.</p>
      <p><strong>On-chain information.</strong> Deposits and payouts occur on Solana. Blockchain transactions are public and permanent by nature, and are not under our control.</p>

      <h2>3. Text prompts and responses</h2>
      <p>When you send a prompt for text inference, it is held in memory, dispatched to one or more contributor machines, streamed back to you, and then discarded. It is never written to our database. What remains afterwards is the job metadata described above.</p>
      <p>Two consequences are worth stating plainly:</p>
      <ul>
        <li><strong>The operator can see prompts in transit.</strong> There is no end-to-end encryption between you and the machine serving your request. Our orchestrator handles prompt text in readable form because it must route and meter it.</li>
        <li><strong>Contributor machines receive your prompt text, but not your identity.</strong> Workers are given the text to process and nothing that identifies who sent it.</li>
      </ul>
      <p>Operational logs used for debugging and billing may contain account and job identifiers, timing, and error information. They do not contain prompt or response text.</p>

      <h2>4. Image generation is different</h2>
      <p>Image generation does not work like text inference, and we want this to be unambiguous.</p>
      <p>When you generate an image we store the <strong>prompt text</strong> and any negative prompt, the model, seed and dimensions, the credits charged, whether the result was flagged as adult content, and the time of creation. This record is linked to your account.</p>
      <p><strong>By default these images are marked public.</strong> Images that are marked public, are not flagged as adult content, and have not been blocked may appear on a public gallery visible to anyone. The gallery displays the prompt, model, dimensions and date. It does not display your account identifier, wallet, or username &mdash; entries are unattributed.</p>
      <p>If you do not want an image prompt to be public, do not generate it on the public setting. Contact us to have specific records removed.</p>

      <h2>5. Service providers</h2>
      <p>We use a small number of processors, each for a specific function:</p>
      <ul>
        <li><strong>Privy</strong> &mdash; authentication and embedded wallets.</li>
        <li><strong>Supabase</strong> &mdash; managed database infrastructure and backups.</li>
        <li><strong>Cloudflare</strong> &mdash; DNS, TLS termination, and protection against denial-of-service traffic.</li>
        <li><strong>Brave Search</strong> &mdash; only when you use a feature that performs a web search; your query is sent to Brave for that request.</li>
        <li><strong>A Solana RPC provider</strong> &mdash; for reading and submitting on-chain transactions.</li>
        <li><strong>Contributor operators</strong> &mdash; independent people and businesses running the machines that serve inference. They receive prompt text without your identity.</li>
      </ul>

      <h2>6. Retention</h2>
      <p>Text prompts and responses are not retained. Billing and job metadata, image records, worker records and reputation history are retained for as long as your account exists and afterwards where we are required to keep them for tax, accounting or fraud-prevention purposes. Hashed IP counters are retained on a rolling short-term basis for rate limiting.</p>

      <h2>7. Your rights</h2>
      <p>You may request access to the personal information we hold about you, correction of it, deletion of your account and associated records, or a copy in portable form. If you are in the European Economic Area or the United Kingdom, you additionally have the right to object to or restrict certain processing, and to complain to your national data protection authority.</p>
      <p>Two limits are honest to state. We cannot delete information that has already been written to a public blockchain, and we may retain records we are legally required to keep.</p>
      <p>To exercise any of these rights, contact us at the address in section 9.</p>

      <h2>8. Cookies and local storage</h2>
      <p>We use cookies and browser storage that are necessary for the service to function &mdash; keeping you signed in through Privy, and holding your conversation history locally in your own browser so it is not on our servers. We do not use advertising cookies or cross-site tracking.</p>

      <h2>9. Contact</h2>
      <p>
        Compute Network Inc.<br />
        Privacy enquiries: <a href="mailto:privacy@compute.tech">privacy@compute.tech</a>
      </p>

      <h2>10. Changes</h2>
      <p>If we change this policy in a way that materially reduces your privacy, we will say so on the site rather than quietly revising the date at the top.</p>
    </LegalPage>
  );
}
