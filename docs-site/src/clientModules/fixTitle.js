import siteConfig from '@generated/docusaurus.config';

const TITLE = siteConfig.title;

if (typeof window !== 'undefined') {
  const observer = new MutationObserver(() => {
    if (document.title !== TITLE) {
      document.title = TITLE;
    }
  });
  observer.observe(document.querySelector('title') || document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  document.title = TITLE;
}
