import "./global.css";

import { type Metadata } from "next";

import { getClientConfig } from "./config/client";

export const metadata: Metadata = {
  title: "AIBR - GPT test tool",
  description: "AIBR - GPT test tool",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#151515" },
  ],
  appleWebApp: {
    title: "AIBR - GPT test tool",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="ml-[10px]">
      <head>
        <meta name="config" content={JSON.stringify(getClientConfig())} />
        <link rel="manifest" href="/site.webmanifest"></link>
        <script src="/serviceWorkerRegister.js" defer></script>
      </head>
      <body className="overflow-hidden overflow-y-scroll h-screen w-screen relative bg-zinc-900">
        {children}
      </body>
    </html>
  );
}
