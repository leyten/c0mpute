/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    'why-c0mpute',
    'how-it-works',
    'architecture',
    {
      type: 'category',
      label: 'User Guide',
      items: [
        'user-guide/getting-started',
        'user-guide/model-tiers',
      ],
    },
    {
      type: 'category',
      label: 'Worker Guide',
      items: [
        'worker-guide/browser-worker',
        {
          type: 'category',
          label: 'Native Worker',
          items: [
            'worker-guide/native-worker/index',
            'worker-guide/native-worker/linux',
            'worker-guide/native-worker/windows',
            'worker-guide/native-worker/macos',
            'worker-guide/native-worker/troubleshooting',
          ],
        },
        'worker-guide/tokens',
      ],
    },
  ],
};

module.exports = sidebars;
