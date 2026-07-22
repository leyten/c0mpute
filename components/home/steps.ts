// The lifecycle of a GPU on the network (NETWORK_ARCHITECTURE.md §2).
// Voice: plain and human — say it like you'd say it out loud.
export const STEPS = [
  { n: '01', title: 'Announce', line: 'Your box joins the network and announces its hardware.' },
  { n: '02', title: 'Admit', line: 'The network measures your VRAM, bandwidth and latency, then assigns your box a role.' },
  { n: '03', title: 'Place', line: 'That role is a slice of the model, as many layers as fit in its VRAM.' },
  { n: '04', title: 'Pull', line: 'Your box torrents those layers from other nodes, and every block is hash-checked.' },
  { n: '05', title: 'Form', line: 'Your box links up with nearby machines. Together they hold the whole model.' },
  { n: '06', title: 'Serve', line: 'Tokens loop through the ring, and every machine signs for its part of the work.' },
  { n: '07', title: 'Settle', line: 'The receipts are checked. Work that fails verification is not paid.' },
  { n: '08', title: 'Pay', line: 'Every job pays out in USDC, split by the layers your box served.' },
];

// One-paragraph version of the spine for the compressed layouts.
export const LIFECYCLE_SUMMARY =
  'Announce your box and the network measures it, admits it, and hands it a slice of a model sized to its ' +
  'VRAM. It torrents exactly those layers from peers, forms a low-latency ring that holds one full copy, ' +
  'and serves — signing a receipt for every pass. Receipts settle, and it earns USDC for every token it ' +
  'helped produce.';
