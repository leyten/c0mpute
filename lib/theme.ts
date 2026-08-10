/**
 * Theme plumbing shared by the document head and the toggle.
 *
 * The theme is a `data-theme` attribute on <html>, never a media query: the
 * site serves two brands off one deployment and c0mpute.ai has to stay dark
 * permanently, whatever the visitor's OS is set to.
 *
 * Resolution order, highest first:
 *   1. the visitor's stored override, applied by NO_FLASH_SCRIPT before paint
 *   2. the brand default rendered into the HTML on the server
 *
 * Only Compute Network takes part. c0mpute.ai renders data-theme="dark",
 * ships no script, and never reads storage.
 */

export type Theme = 'light' | 'dark';

/**
 * Namespaced to the new brand on purpose. Every live key on the legacy domain
 * is `c0mpute_*`; colliding with one of those would log real users out, so
 * this deliberately shares no prefix with them.
 */
export const THEME_STORAGE_KEY = 'computenetwork_theme';

/**
 * Runs blocking in <head>, before the body is parsed and so before first
 * paint. Without it the server-rendered default paints first and anyone who
 * chose dark gets a white flash on every single navigation — this is a
 * multi-page app, so that would be every click, not just a cold load.
 *
 * Deliberately tiny and dependency-free: it is inline, render-blocking, and
 * on the critical path. Wrapped in try/catch because reading localStorage
 * throws outright in Safari's private mode and under a blocked-cookies
 * policy, and a throw here would abort the parser and leave the page blank.
 */
export const NO_FLASH_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){d.dataset.theme=t}}catch(e){}`;
