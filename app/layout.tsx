import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://fair-karaoke.com"), // ← adapte si besoin en preview
  title: {
    default: "Fair-Karaoké",
    template: "%s — Fair-Karaoké",
  },
  description: "Rejoignez votre salle de karaoké.",
  openGraph: {
    type: "website",
    siteName: "Fair-Karaoké",
    title: "Fair-Karaoké",
    description: "Rejoignez votre salle de karaoké.",
    url: "https://fair-karaoke.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fair-Karaoké",
    description: "Rejoignez votre salle de karaoké",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
