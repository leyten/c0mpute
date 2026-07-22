// The lifecycle of a GPU on the network (NETWORK_ARCHITECTURE.md §2), as a
// numbered spine. Row 1 = joining, row 2 = working. Top-rule style, no card
// boxes — boxes stay reserved for the artwork bento.
const STEPS = [
  { n: '01', title: 'Announce', line: 'Your node joins and advertises what it has: GPU, VRAM, bandwidth, reputation.' },
  { n: '02', title: 'Admit', line: 'The network measures the box and assigns it a role. No allowlist, no application.' },
  { n: '03', title: 'Place', line: 'You get a slice: one model, a block of layers, sized to your VRAM, clustered by latency.' },
  { n: '04', title: 'Pull', line: 'You torrent exactly those layers from peers, every block hash-checked against the manifest.' },
  { n: '05', title: 'Form', line: 'You slot into a ring of low-latency neighbours that together hold one full model.' },
  { n: '06', title: 'Serve', line: 'Activations loop through the ring, one pass per token. Your stage signs a receipt for each.' },
  { n: '07', title: 'Settle', line: 'Receipts are checked and the job is accounted, stage by stage. Bad work doesn’t settle.' },
  { n: '08', title: 'Pay', line: 'You earn USDC for every token your slice helped produce.' },
];

export default function LifecycleSpine() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 md:gap-x-8 gap-y-8 md:gap-y-12">
      {STEPS.map((s) => (
        <div key={s.n} className="border-t border-white/15 pt-4 md:pt-5">
          <span className="pixel-sans step-num text-white/40 text-xs md:text-sm">{s.n}</span>
          <h3 className="pixel-serif text-white text-base md:text-lg mt-2">{s.title}</h3>
          <p className="pixel-sans text-white/60 text-xs md:text-sm mt-2 leading-relaxed">{s.line}</p>
        </div>
      ))}
    </div>
  );
}
