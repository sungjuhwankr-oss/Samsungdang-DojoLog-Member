import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaBootstrap } from "./components/pwa-bootstrap";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Samsungdang DojoLog - 수련자",
  description: "개인 아이키도 수련 이력을 기록하는 Samsungdang DojoLog 수련자용 PWA",
  applicationName: "Samsungdang DojoLog - 수련자",
  appleWebApp: {
    capable: true,
    title: "DojoLog 수련자",
    statusBarStyle: "default",
  },
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${basePath}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${basePath}/icons/icon-512.png`, sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: `${basePath}/icons/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#101317" }
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <PwaBootstrap />
        {children}
      </body>
    </html>
  );
}
