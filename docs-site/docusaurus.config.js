// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'c0mpute — docs',
  tagline: 'AI powered by people, not data centers.',
  favicon: 'img/favicon.ico',
  url: 'https://docs.c0mpute.ai',
  baseUrl: '/',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'stylesheet',
        href: 'https://use.typekit.net/kwe2dpm.css',
      },
    },
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
