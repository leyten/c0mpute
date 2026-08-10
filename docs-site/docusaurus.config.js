// @ts-check

// Branding is env-driven so one source tree builds both domains. Every default
// below is the live c0mpute.ai value, so an unset environment reproduces the
// c0mpute.ai docs exactly; scripts/build-compute-tech.sh overrides them (and
// points DOCS_CONTENT_DIR at rebranded markdown) to build docs.compute.tech.
const brand = process.env.DOCS_BRAND || 'c0mpute';
const wordmark = process.env.DOCS_WORDMARK || 'C0MPUTE';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Documentation',
  tagline: 'AI powered by people, not data centers.',
  favicon: 'img/favicon.ico',
  url: process.env.DOCS_URL || 'https://docs.c0mpute.ai',
  // '/' in production; the review copy is built under a path with
  // DOCS_BASE_URL so it can be served beside the rest of the preview.
  baseUrl: process.env.DOCS_BASE_URL || '/',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Editorial theme: Newsreader for display, Inter for body. The Typekit sheet
  // that loaded the retired pixel face is gone with its last consumer.
  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap',
  ],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  clientModules: [require.resolve('./src/clientModules/fixTitle.js')],

  // Read by the swizzled navbar logo, which is a React component and so cannot
  // reach process.env at render time.
  customFields: { wordmark },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          // The rebranded build points this at a generated mirror of ./docs.
          // Filenames are preserved there, so doc ids, routes and the sidebar
          // are identical between the two builds.
          path: process.env.DOCS_CONTENT_DIR || 'docs',
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: true,
        respectPrefersColorScheme: false,
      },
      navbar: {
        title: '',
        items: [
          {
            // Both builds link the canonical app. compute.tech serves the same
            // app and could be linked here instead, but where compute.tech
            // visitors should land is a product decision, not part of the
            // rebrand — and the blog/data/shard chrome links here too.
            href: 'https://c0mpute.ai',
            label: 'App',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Links',
            items: [
              {
                label: 'c0mpute.ai',
                href: 'https://c0mpute.ai',
              },
              {
                // A real account handle, not a brand string — same class of
                // identifier as the npm package below, so both domains link it.
                label: '@c0mputeAI',
                href: 'https://x.com/c0mputeAI',
              },
              {
                label: 'npm',
                href: 'https://www.npmjs.com/package/@c0mpute/worker',
              },
            ],
          },
        ],
        copyright: `${brand} — AI powered by people, not data centers.`,
      },
      prism: {
        theme: require('prism-react-renderer').themes.vsDark,
        darkTheme: require('prism-react-renderer').themes.vsDark,
      },
    }),
};

module.exports = config;
