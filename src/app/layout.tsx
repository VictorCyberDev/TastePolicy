import type { Metadata } from "next";
import { configuredOrigin } from "@/lib/config/origin";
const origin = configuredOrigin();
import "./globals.css";
export const metadata: Metadata = {
  title: "TastePolicy | Subjective Authority Infrastructure",
  description:
    "Your taste. Your rules. Any agent. Qloo cultural evidence, bounded by explicit user authority.",
  openGraph: {
    title: "TastePolicy — Your taste. Your rules. Any agent.",
    description:
      "Subjective Authority Infrastructure for AI agents, built around Qloo cultural evidence.",
    images: [{ url: "/brand/social-card.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/social-card.png"] },
  ...(origin ? { metadataBase: new URL(origin) } : {}),
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
