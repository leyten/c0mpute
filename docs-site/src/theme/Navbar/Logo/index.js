import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function NavbarLogo() {
  return (
    <div className="navbar__brand">
      <Link to="/" className="navbar__brand navbar__wordmark">
        <span>C0MPUTE</span>
      </Link>
    </div>
  );
}
