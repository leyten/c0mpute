// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'c0mpute — docs',
  tagline: 'AI powered by people, not data centers.',
  favicon: 'img/favicon.ico',
  url: 'https://docs.c0mpute.ai',
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

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
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
        copyright: `c0mpute — AI powered by people, not data centers.`,
      },
      prism: {
        theme: require('prism-react-renderer').themes.vsDark,
        darkTheme: require('prism-react-renderer').themes.vsDark,
      },
    }),
};

module.exports = config;
