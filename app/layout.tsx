import type { Metadata } from "next";
import "./globals.css";
import PrivyProvider from "@/providers/PrivyProvider";

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
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/kwe2dpm.css" />
      </head>
      <body>
        <PrivyProvider>
          {children}
        </PrivyProvider>
      </body>
    </html>
  );
}
