import type { Metadata } from "next";
import { configuredOrigin } from "@/lib/config/origin";
const origin = configuredOrigin();
import "./globals.css";
export const metadata: Metadata = {
  title: "TastePolicy | Qloo taste, bounded by your rules",
  description:
    "Your AI knows your taste. Who said it could choose? Qloo finds what fits; TastePolicy decides where the agent must stop.",
  openGraph: {
    title: "TastePolicy — Your AI knows your taste. Who said it could choose?",
    description:
      "Qloo finds what fits. TastePolicy turns cultural evidence into bounded agent authority: ALLOW, ASK, REJECT or UNAVAILABLE.",
    images: [{ url: "/brand/social-card.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TastePolicy — Qloo taste, bounded by your rules",
    description:
      "A 99% taste match can still be a hard no. Qloo finds what fits; TastePolicy decides where the agent must stop.",
    images: ["/brand/social-card.png"],
  },
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
