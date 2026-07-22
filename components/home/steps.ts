// The lifecycle of a GPU on the network (NETWORK_ARCHITECTURE.md §2).
// Voice: plain and human — say it like you'd say it out loud.
export const STEPS = [
  { n: '01', title: 'Announce', line: 'Your box joins the network and says what it’s got.' },
  { n: '02', title: 'Admit', line: 'The network measures it and hands it a role. No signup, no gatekeeper.' },
  { n: '03', title: 'Place', line: 'It gets a slice of the model, as many layers as its VRAM can hold.' },
  { n: '04', title: 'Pull', line: 'It torrents those layers straight from other nodes. Every block gets hash-checked.' },
  { n: '05', title: 'Form', line: 'It links up with nearby machines. Together they hold the whole model.' },
  { n: '06', title: 'Serve', line: 'Tokens loop through the ring, and every machine signs for its part of the work.' },
  { n: '07', title: 'Settle', line: 'The receipts get checked. Work that doesn’t check out doesn’t get paid.' },
  { n: '08', title: 'Pay', line: 'USDC lands for every token the box helped produce.' },
];

// One-paragraph version of the spine for the compressed layouts.
export const LIFECYCLE_SUMMARY =
  'Announce your box and the network measures it, admits it, and hands it a slice of a model sized to its ' +
  'VRAM. It torrents exactly those layers from peers, forms a low-latency ring that holds one full copy, ' +
  'and serves — signing a receipt for every pass. Receipts settle, and it earns USDC for every token it ' +
  'helped produce.';
