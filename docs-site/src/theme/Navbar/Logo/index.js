import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function NavbarLogo() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <div className="navbar__brand">
      <Link to="/" className="navbar__brand navbar__wordmark">
        <span>{siteConfig.customFields.wordmark}</span>
      </Link>
    </div>
  );
}
