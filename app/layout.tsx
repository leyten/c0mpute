import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Newsreader } from "next/font/google";
import { brandForHost } from "@/lib/brand";
import { BrandProvider } from "@/components/BrandProvider";
import "./globals.css";
import "./homepage-variants.css";
import PrivyProvider from "@/providers/PrivyProvider";

// The editorial theme, app-wide: Newsreader display + Inter body. The legacy
// .pixel-serif/.pixel-sans hooks across every page are re-skinned by the
// .v-b scope on <body> (homepage-variants.css).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-newsreader" });

// Title, description and icon follow the Host header, so compute.tech presents as
// Compute Network while c0mpute.ai keeps exactly the metadata it always had.
// The social card is gated on brand.social, which only the new brand defines:
// adding OG tags to the legacy brand would change what c0mpute.ai serves.
export async function generateMetadata(): Promise<Metadata> {
  const brand = brandForHost((await headers()).get('host'));
  const base: Metadata = {
    title: brand.title,
    description: brand.description,
    icons: { icon: brand.icon },
  };
  if (!brand.social) return base;

  const { url, ogImage, appleIcon } = brand.social;
  return {
    ...base,
    metadataBase: new URL(url),
    icons: { icon: brand.icon, apple: appleIcon },
    openGraph: {
      title: brand.title,
      description: brand.description,
      url,
      siteName: brand.name,
      type: 'website',
      images: [{ url: ogImage, width: 512, height: 512, alt: brand.name }],
    },
    twitter: {
      // The card is square, so summary rather than summary_large_image.
      card: 'summary',
      title: brand.title,
      description: brand.description,
      images: [ogImage],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const brand = brandForHost((await headers()).get('host'));

  return (
    <html lang="en">
      <body className={`v-b ${inter.variable} ${newsreader.variable}`}>
        <BrandProvider brand={brand}>
          <PrivyProvider>
            {children}
          </PrivyProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
