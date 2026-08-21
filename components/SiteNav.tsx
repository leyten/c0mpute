'use client';

// One navigation for the whole site, on the interaction grammar measured off
// cloudflare.com: a full-width chrome-less bar (no floating pill box), hover
// feedback carried by a single shared pill that slides between the tabs, and
// a dropdown that grows out of the header as one raised card. The construction
// lives in globals.css under "Site header"; this file owns the geometry and
// the state machine.
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { LogoMark } from '@/components/Logo';
import { useBrand } from '@/components/BrandProvider';
import ThemeToggle from '@/components/ThemeToggle';

const EXPO = 'cubic-bezier(0.19, 1, 0.22, 1)';

const TABS = [
  { href: '/chat', label: 'Chat' },
  { href: '/create', label: 'Create' },
  { href: '/earn', label: 'Earn' },
];

export default function SiteNav({
  /** Homepage mode: transparent ground, and the tabs + utilities scrub away
      over the first 80px of scroll (the logo stays; a primary CTA fades in
      past the hero). Everywhere else the bar is solid and static. */
  overHero = false,
  /** The homepage's ink hero card slides under the bar on scroll; while it
      does, the header wears .hdr-on-ink (white ladder) so the chrome stays
      legible. Only meaningful together with overHero. */
  inkHero = false,
}: {
  overHero?: boolean;
  inkHero?: boolean;
}) {
  const brand = useBrand();
  const { isLoading, isAuthenticated, login, logout, xUsername, walletAddress } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // ── the sliding pill ──────────────────────────────────────────────────────
  // One persistent element behind the tabs. JS writes left/width/opacity
  // inline: on first hover it appears in place (position set with transitions
  // off, then fades in); between tabs it slides; on leave it fades where it
  // stands rather than sliding home.
  const rowRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const pillLive = useRef(false);

  const pillTo = (el: HTMLElement) => {
    const pill = pillRef.current, row = rowRef.current;
    if (!pill || !row) return;
    const r = el.getBoundingClientRect(), w = row.getBoundingClientRect();
    const left = `${r.left - w.left}px`, width = `${r.width}px`;
    if (!pillLive.current) {
      pill.style.transition = `opacity 0.3s ${EXPO}`;
      pill.style.left = left;
      pill.style.width = width;
      void pill.offsetWidth; // commit the position before the fade starts
      pill.style.opacity = '1';
      pillLive.current = true;
      requestAnimationFrame(() => {
        pill.style.transition = `left 0.3s ${EXPO}, width 0.3s ${EXPO}, opacity 0.3s ${EXPO}`;
      });
    } else {
      pill.style.left = left;
      pill.style.width = width;
      pill.style.opacity = '1';
    }
  };
  const pillOff = () => {
    const pill = pillRef.current;
    if (!pill) return;
    pill.style.opacity = '0';
    pillLive.current = false;
  };

  // ── the Token dropdown ────────────────────────────────────────────────────
  // Hover-opened, with an 80ms grace timer so the pointer can cross from the
  // trigger into the panel; frame and content animate on separate curves
  // (.nav-panel in globals.css); Escape and click both close.
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelOn, setPanelOn] = useState(false);
  const panelOnRef = useRef(false);
  useEffect(() => { panelOnRef.current = panelOn; }, [panelOn]);
  const tokenBtnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (unmountTimer.current) { clearTimeout(unmountTimer.current); unmountTimer.current = null; }
  };
  const wantOpen = useRef(false);
  const openPanel = () => {
    cancelClose();
    wantOpen.current = true;
    if (panelMounted) setPanelOn(true);
    else setPanelMounted(true);
  };
  useEffect(() => {
    if (!panelMounted) return;
    // Two frames so the closed state paints before the open transition runs;
    // the wantOpen check keeps a queued frame from re-opening a panel that
    // was closed (Escape, click) inside that window.
    let inner = 0;
    const id = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => { if (wantOpen.current) setPanelOn(true); });
    });
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(inner); };
  }, [panelMounted]);
  const rowHover = useRef(false);
  const commitClose = () => {
    wantOpen.current = false;
    setPanelOn(false);
    // The pill is the row's, not the panel's: it only dies with the panel
    // when the pointer has left the tabs too. Hover moved from the open
    // trigger onto another tab closes the panel but keeps the pill there.
    if (!rowHover.current) pillOff();
    unmountTimer.current = setTimeout(() => setPanelMounted(false), 130);
  };
  const scheduleClose = () => {
    if (!panelMounted && !panelOnRef.current) return; // nothing to close
    cancelClose();
    closeTimer.current = setTimeout(commitClose, 80);
  };
  useEffect(() => () => cancelClose(), []);
  useEffect(() => {
    if (!panelMounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { cancelClose(); commitClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelMounted]);

  const rowEnter = () => { rowHover.current = true; };
  const rowLeave = () => {
    rowHover.current = false;
    // With the menu open the pill holds under its trigger while the pointer
    // travels down into the panel; otherwise it fades where it is. Either
    // way a close is scheduled: if the pointer is headed into the panel, the
    // wrapper's enter cancels it inside the grace window; if it left
    // sideways, this is the only close path.
    if (panelOnRef.current && tokenBtnRef.current) pillTo(tokenBtnRef.current);
    else pillOff();
    scheduleClose();
  };
  // Focus leaving the tabs + panel entirely closes the panel — the keyboard
  // equivalent of the pointer paths above.
  const panelWrapRef = useRef<HTMLDivElement>(null);
  const onNavBlur = (e: React.FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (rowRef.current?.contains(to) || panelWrapRef.current?.contains(to)) return;
    scheduleClose();
  };

  // ── homepage scroll scrub ─────────────────────────────────────────────────
  // Scrubbed 1:1 with scrollY, not toggled: translateY(-min(y,80)) and
  // opacity 1 - y/80 on the tabs and utilities. The logo stays. Past the
  // hero, the primary CTA fades in where the utilities were.
  const scrubTabsRef = useRef<HTMLDivElement>(null);
  const scrubUtilRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!overHero) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      // Desktop only: on a phone the utilities strip carries Login and there
      // is no CTA to replace it, so it must not scrub away.
      const scrub = window.innerWidth >= 768;
      const k = Math.min(y, 80);
      const op = String(Math.max(0, 1 - y / 80));
      for (const el of [scrubTabsRef.current, scrubUtilRef.current]) {
        if (!el) continue;
        el.style.transform = scrub ? `translateY(${-k}px)` : '';
        el.style.opacity = scrub ? op : '';
        // visibility, not pointer-events: the children re-enable
        // pointer-events on themselves, so only visibility takes them out
        // of hit-testing once they are gone.
        el.style.visibility = scrub && y >= 78 ? 'hidden' : '';
      }
      ctaRef.current?.classList.toggle('on', scrub && y > window.innerHeight * 0.7);
      // The tabs are gone past 78px — a panel they anchored must not float on.
      if (scrub && y >= 78 && panelOnRef.current) { cancelClose(); commitClose(); }
      // White chrome while ANY ink card (hero or the closing band) crosses
      // the bar's midline — not its edges, or the flip fires while the bar
      // is still visibly on paper.
      if (inkHero && headerRef.current) {
        const mid = window.innerWidth >= 768 ? 36 : 27;
        let onInk = false;
        document.querySelectorAll('.ink-card').forEach((c) => {
          const r = c.getBoundingClientRect();
          if (r.top < mid && r.bottom > mid) onInk = true;
        });
        headerRef.current.classList.toggle('hdr-on-ink', onInk);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    apply();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overHero, inkHero]);

  const userDisplay = xUsername
    ? `@${xUsername}`
    : walletAddress
      ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
      : 'User';

  const tokenItems = [
    { href: '/staking', label: 'Staking', note: 'Stake and earn' },
    { href: '/treasury', label: 'Treasury', note: 'Buybacks and burns' },
    { href: brand.urls.data, label: 'Data', note: 'Live network stats', ext: true },
  ];

  // The header itself never catches the pointer on the homepage (content
  // scrolls under a transparent bar); on solid pages it does, so nothing
  // hidden behind the bar can be clicked through it.
  return (
    <header
      ref={headerRef}
      className={`fixed top-0 left-0 right-0 z-50 ${
        overHero ? 'pointer-events-none' : 'pointer-events-auto bg-background'
      } [&_a]:pointer-events-auto [&_button]:pointer-events-auto`}
    >
      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-6">
        <div className="h-[54px] md:h-[72px] flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] gap-3">
          {/* Left: logo */}
          <div className="flex items-center">
            <a href="/" className="cursor-pointer pixel-serif-logo text-fg text-lg md:text-xl font-bold flex items-center gap-2 md:gap-2.5">
              {brand.mark ? (
                <>
                  <LogoMark className="w-6 h-6 md:w-7 md:h-7 shrink-0" />
                  <span>Compute<span className="hidden sm:inline"> Network</span></span>
                </>
              ) : (
                <span>
                  c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
                </span>
              )}
            </a>
          </div>

          {/* Center: tabs behind the shared pill */}
          <div ref={scrubTabsRef} className="hidden md:flex justify-center transition-opacity duration-150 ease-out will-change-transform">
            <nav
              aria-label="Main"
              ref={rowRef}
              onMouseEnter={rowEnter}
              onMouseLeave={rowLeave}
              onBlur={onNavBlur}
              className="pointer-events-auto relative flex items-center h-[38px]"
            >
              <div ref={pillRef} className="nav-pill" />
              {TABS.map((t) => (
                <a
                  key={t.href}
                  href={t.href}
                  onMouseEnter={(e) => { pillTo(e.currentTarget); scheduleClose(); }}
                  className="relative z-[1] cursor-pointer pixel-sans text-fg text-[15px] font-medium px-3 h-full inline-flex items-center"
                >
                  {t.label}
                </a>
              ))}
              <button
                ref={tokenBtnRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={panelOn}
                onMouseEnter={(e) => { pillTo(e.currentTarget); openPanel(); }}
                onFocus={openPanel}
                onClick={() => { if (panelOnRef.current) { cancelClose(); commitClose(); } else openPanel(); }}
                className="relative z-[1] cursor-pointer pixel-sans text-fg text-[15px] font-medium px-3 h-full inline-flex items-center gap-1.5"
              >
                Token
                {/* Stacked select-style chevrons. They never rotate — only
                    their weight answers the open state. */}
                <svg
                  width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"
                  className={`transition-opacity duration-200 ${panelOn ? 'opacity-100' : 'opacity-30'}`}
                  style={{ transitionTimingFunction: EXPO }}
                >
                  <path d="M6.5 8 10 4.5 13.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6.5 12 10 15.5 13.5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </nav>
          </div>

          {/* The Token panel: one raised card, viewport-centred under the
              header, growing downward out of it. Fixed-positioned, so it must
              stay a SIBLING of the scrub container — a transformed ancestor
              would become its containing block. It sits here in the DOM so
              its links follow the trigger in tab order. z-20 lifts it above
              the row so the pt-6 hover bridge is actually hoverable on solid
              pages, where the header strip catches the pointer. */}
          {panelMounted && (
            <div
              ref={panelWrapRef}
              className="hidden md:block fixed left-1/2 -translate-x-1/2 top-10 z-20 pt-6 pointer-events-auto"
              onMouseEnter={openPanel}
              onMouseLeave={scheduleClose}
              onBlur={onNavBlur}
            >
              <div className={`nav-panel ${panelOn ? 'on' : ''}`}>
                <div className="nav-card w-[360px]">
                  <div className="nav-panel-content rounded-md border border-fg/10 overflow-hidden bg-raise divide-y divide-fg/5">
                    {tokenItems.map((item) => (
                      <a
                        key={item.label}
                        href={item.href}
                        {...(item.ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        className="cursor-pointer block px-4 py-3 hover:bg-fg/[0.04] transition-colors"
                      >
                        <span className="block pixel-sans text-fg text-sm font-medium">{item.label}</span>
                        <span className="block pixel-sans text-fg-45 text-xs mt-0.5">{item.note}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Right: utilities, and on the homepage the scroll CTA that
              replaces them */}
          <div className="relative flex items-center justify-end gap-2">
            <div ref={scrubUtilRef} className="flex items-center gap-1 transition-opacity duration-150 ease-out will-change-transform">
              <div className="hidden md:flex items-center">
                <a
                  href="https://github.com/leyten/c0mpute"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer nav-icon text-fg-70 hover:text-fg p-2"
                  aria-label="View source on GitHub"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                </a>
                <a
                  href="https://x.com/c0mputeAI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer nav-icon text-fg-70 hover:text-fg p-2"
                  aria-label="Follow us on X"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="https://t.me/c0mputeAI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer nav-icon text-fg-70 hover:text-fg p-2"
                  aria-label="Join us on Telegram"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                  </svg>
                </a>
                {/* Compute Network only — renders null on c0mpute.ai. */}
                <ThemeToggle className="cursor-pointer nav-icon text-fg-70 hover:text-fg p-2" />
              </div>

              {isLoading ? (
                <div className="hdr-btn pixel-sans text-sm font-medium text-fg-50 ml-1"><span>...</span></div>
              ) : isAuthenticated ? (
                <div className="relative ml-1">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="cursor-pointer hdr-btn pixel-sans text-sm font-medium"
                  >
                    <span>{userDisplay}</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="currentColor"
                      className={`transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                    >
                      <path d="M5 7L1 3h8L5 7z" />
                    </svg>
                  </button>
                  {userMenuOpen && (
                    <div className="nav-pop origin-top-right absolute right-0 top-full mt-2 nav-card min-w-[180px] z-50">
                      <div className="rounded-md border border-fg/10 overflow-hidden bg-raise">
                        <a
                          href="/settings"
                          onClick={() => setUserMenuOpen(false)}
                          className="cursor-pointer pixel-sans text-sm block w-full px-4 py-2.5 text-left text-fg-70 hover:text-fg hover:bg-fg/[0.04] transition-colors"
                        >
                          Settings
                        </a>
                        <button
                          onClick={() => { logout(); setUserMenuOpen(false); }}
                          className="cursor-pointer pixel-sans text-sm w-full px-4 py-2.5 text-left text-fg-70 hover:text-fg hover:bg-fg/[0.04] transition-colors border-t border-fg/10"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => login()}
                  className="hdr-btn pixel-sans text-sm font-medium ml-1"
                >
                  <span>Login</span>
                </button>
              )}
            </div>

            {overHero && (
              <a
                ref={ctaRef}
                href="/chat"
                className="nav-cta hdr-btn hdr-btn-primary pixel-sans text-sm font-medium absolute right-0 top-[calc(50%-19px)] hidden md:inline-flex"
              >
                <span>Ask anything</span>
              </a>
            )}

            {/* Hamburger — mobile only */}
            <button
              className="cursor-pointer md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              <span className={`block w-5 h-0.5 bg-fg transition-transform ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-5 h-0.5 bg-fg transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-0.5 bg-fg transition-transform ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile menu — the same raised card as the dropdown */}
        {menuOpen && (
          <nav aria-label="Menu" className="md:hidden nav-pop origin-top nav-card mt-1 pointer-events-auto">
            <div className="rounded-md border border-fg/10 bg-raise px-4 py-4 flex flex-col gap-4">
              <a
                href="/chat"
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Chat
              </a>
              <a
                href="/create"
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Create
              </a>
              <a
                href="/earn"
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Earn
              </a>
              <a
                href="/staking"
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Staking
              </a>
              <a
                href="/treasury"
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Treasury
              </a>
              <a
                href={brand.urls.data}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Data
              </a>
              <a
                href={brand.urls.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Docs
              </a>
              <a
                href={brand.urls.blog}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Blog
              </a>
              <a
                href="https://x.com/c0mputeAI"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide flex items-center gap-2"
                onClick={() => setMenuOpen(false)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Follow on X
              </a>
              <a
                href="https://t.me/c0mputeAI"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide flex items-center gap-2"
                onClick={() => setMenuOpen(false)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
                Join on Telegram
              </a>

              <ThemeToggle
                withLabel
                className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide flex items-center gap-2"
              />

              {/* Auth section in mobile menu */}
              <div className="border-t border-fg/10 pt-4 mt-2">
                {isAuthenticated ? (
                  <>
                    <div className="pixel-sans text-fg-70 text-xs mb-2">Logged in as</div>
                    <div className="pixel-sans text-fg text-sm mb-4">{userDisplay}</div>
                    <a
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide block mb-3"
                    >
                      Settings
                    </a>
                    <button
                      onClick={() => { logout(); setMenuOpen(false); }}
                      className="cursor-pointer pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide block"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { login(); setMenuOpen(false); }}
                    className="pixel-sans text-fg-70 hover:text-fg transition-colors text-sm tracking-wide"
                  >
                    Login
                  </button>
                )}
              </div>
            </div>
          </nav>
        )}
      </div>

    </header>
  );
}
