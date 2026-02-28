import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function NavbarLogo() {
  return (
    <div className="navbar__brand">
      <Link to="/" className="navbar__brand" style={{textDecoration: 'none', display: 'flex', alignItems: 'baseline'}}>
        <span style={{
          fontFamily: '"argent-pixel-cf", sans-serif',
          fontWeight: 400,
          fontSmooth: 'never',
          WebkitFontSmoothing: 'none',
          MozOsxFontSmoothing: 'unset',
          color: 'white',
          fontSize: '0.95rem',
          letterSpacing: '0.08em',
        }}>
          C<span style={{fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: 1, marginTop: '-0.3em'}}>0</span>MPUTE
        </span>
      </Link>
    </div>
  );
}
