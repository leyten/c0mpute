import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import "./homepage-variants.css";
import PrivyProvider from "@/providers/PrivyProvider";

// The editorial theme, app-wide: Newsreader display + Inter body. The legacy
// .pixel-serif/.pixel-sans hooks across every page are re-skinned by the
// .v-b scope on <body> (homepage-variants.css).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-newsreader" });

export const metadata: Metadata = {
  title: "c0mpute",
  description: "c0mpute: A decentralized AI built from the collective compute of its users.",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`v-b ${inter.variable} ${newsreader.variable}`}>
        <PrivyProvider>
          {children}
        </PrivyProvider>
      </body>
    </html>
  );
}
