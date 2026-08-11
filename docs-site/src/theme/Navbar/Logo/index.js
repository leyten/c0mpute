import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function NavbarLogo() {
  const {siteConfig} = useDocusaurusContext();
  const {wordmark, homeHref} = siteConfig.customFields;
  // An absolute destination has to go through href; `to` is for in-site routes
  // and would be resolved against the docs base path.
  // target="_self" because Docusaurus opens external hrefs in a new tab by
  // default, and the wordmark is a way home, not an outbound link.
  const target = /^https?:\/\//.test(homeHref)
    ? {href: homeHref, target: '_self'}
    : {to: homeHref};
  return (
    <div className="navbar__brand">
      <Link {...target} className="navbar__brand navbar__wordmark">
        <span>{wordmark}</span>
      </Link>
    </div>
  );
}
