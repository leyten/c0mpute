// The lifecycle of a GPU on the network (NETWORK_ARCHITECTURE.md §2).
export const STEPS = [
  { n: '01', title: 'Announce', line: 'Your node joins and advertises what it has: GPU, VRAM, bandwidth, reputation.' },
  { n: '02', title: 'Admit', line: 'The network measures the box and assigns it a role. No allowlist, no application.' },
  { n: '03', title: 'Place', line: 'You get a slice: one model, a block of layers, sized to your VRAM, clustered by latency.' },
  { n: '04', title: 'Pull', line: 'You torrent exactly those layers from peers, every block hash-checked against the manifest.' },
  { n: '05', title: 'Form', line: 'You slot into a ring of low-latency neighbours that together hold one full model.' },
  { n: '06', title: 'Serve', line: 'Activations loop through the ring, one pass per token. Your stage signs a receipt for each.' },
  { n: '07', title: 'Settle', line: 'Receipts are checked and the job is accounted, stage by stage. Bad work doesn’t settle.' },
  { n: '08', title: 'Pay', line: 'You earn USDC for every token your slice helped produce.' },
];

// One-paragraph version of the spine for the compressed layouts.
export const LIFECYCLE_SUMMARY =
  'Announce your box and the network measures it, admits it, and hands it a slice of a model sized to its ' +
  'VRAM. It torrents exactly those layers from peers, forms a low-latency ring that holds one full copy, ' +
  'and serves — signing a receipt for every pass. Receipts settle, and it earns USDC for every token it ' +
  'helped produce.';
