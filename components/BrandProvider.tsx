'use client';

import { createContext, useContext } from 'react';
import { FALLBACK_BRAND, type Brand } from '@/lib/brand';

// Resolved once on the server from the Host header and handed down, so client
// components never read window.location and never disagree with the HTML that
// was sent to them.
const BrandContext = createContext<Brand>(FALLBACK_BRAND);

export function BrandProvider({
  brand,
  children,
}: {
  brand: Brand;
  children: React.ReactNode;
}) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}
