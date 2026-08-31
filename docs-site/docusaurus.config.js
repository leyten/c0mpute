// @ts-check

// Branding is env-driven so one source tree builds both domains. The hosts and
// assets below still default to their live c0mpute.ai values; the brand name
// now defaults to Compute Network, so an unset environment builds the docs
// under the new name on the old domain. scripts/build-compute-tech.sh still
// sets them explicitly (and points DOCS_CONTENT_DIR at rebranded markdown) to
// build docs.compute.tech.
// Anything not read from env here is shared, and changing it moves both
// domains at once on their next build.
const brand = process.env.DOCS_BRAND || 'Compute Network';
const wordmark = process.env.DOCS_WORDMARK || 'Compute Network';
// Where the wordmark points. The legacy docs send you to the site root they
// are served from; compute.tech points at its own front door.
const homeHref = process.env.DOCS_HOME_HREF || '/';
// The App link. `??` not `||`, so passing an empty string is a way to say "no
// link" rather than falling through to the default.
const appHref = process.env.DOCS_APP_HREF ?? 'https://c0mpute.ai';

/** @type {import('@docusaurus/types').Config} */
const config = {
  // Compute Network names every surface `Compute Network / <Page>`, so its docs
  // are `Compute Network / Docs`. Docusaurus composes a page's tab title as
  // `<Page> | <site title>`, but src/clientModules/fixTitle.js then pins the tab
  // to this string alone, so this is what a reader sees on every docs page.
  // c0mpute.ai keeps the plain default.
  title: process.env.DOCS_TITLE || 'Documentation',
  tagline: 'AI powered by people, not data centers.',
  favicon: process.env.DOCS_FAVICON || 'img/favicon.ico',
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
  customFields: { wordmark, homeHref },

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
          // The docs read on a dark ground on both domains. disableSwitch
          // below means this is not a default the reader can leave — it is the
          // only mode the site has.
          defaultMode: process.env.DOCS_COLOR_MODE || 'dark',
        disableSwitch: true,
        respectPrefersColorScheme: false,
      },
      navbar: {
        title: '',
        // On compute.tech the wordmark itself is the way back to the site, so
        // a second link to the same place earns nothing; the legacy docs keep
        // theirs, where the wordmark only goes to the docs root.
        items: appHref ? [{ href: appHref, label: 'App', position: 'right' }] : [],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Links',
            items: [
              {
                // The site these docs belong to, which is a different site on
                // each domain — this used to send compute.tech readers back to
                // c0mpute.ai.
                label: homeHref === '/' ? 'c0mpute.ai' : 'compute.tech',
                href: homeHref === '/' ? 'https://c0mpute.ai' : homeHref,
              },
              {
                // A real account handle, not a brand string — same class of
                // identifier as the npm package below, so both domains link it.
                label: '@computenet_',
                href: 'https://x.com/computenet_',
              },
              {
                label: 'npm',
                href: 'https://www.npmjs.com/package/@compute-network/worker',
              },
            ],
          },
        ],
        // Dropped on compute.tech; c0mpute.ai keeps it, as it keeps the rest of
        // its chrome. Undefined rather than an empty string so the theme omits
        // the element instead of rendering a blank one.
        copyright: homeHref === '/' ? `${brand} — AI powered by people, not data centers.` : undefined,
      },
      prism: {
        theme: require('prism-react-renderer').themes.vsDark,
        darkTheme: require('prism-react-renderer').themes.vsDark,
      },
    }),
};

module.exports = config;
