// Dated, receipt-backed demonstrations — never live-service claims.
const RECEIPTS = [
  {
    tag: 'JUL 2026 · DEMONSTRATED',
    title: 'A stranger’s home GPU served',
    body: 'A residential 4090 behind a double NAT — mid-game — joined via relay hole-punch, torrented its weights from a peer, and served a 200B+ model.',
  },
  {
    tag: 'MEASURED · TEST RINGS',
    title: 'Interactive speed, scattered',
    body: '20–30 tokens per second per stream, measured on betanet test rings of scattered consumer GPUs — no data-center interconnect anywhere.',
  },
  {
    tag: 'JUL 2026 · DEMONSTRATED',
    title: 'Every byte verified',
    body: 'Model weights pulled peer-first on real hardware with the mirror deliberately broken — every block hash-verified against the signed manifest.',
  },
];

export default function Receipts() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
      {RECEIPTS.map((r) => (
        <div key={r.title} className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
          <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3">{r.tag}</div>
          <h4 className="pixel-serif text-white text-lg mb-2">{r.title}</h4>
          <p className="pixel-sans text-white/70 text-sm leading-relaxed">{r.body}</p>
        </div>
      ))}
    </div>
  );
}
