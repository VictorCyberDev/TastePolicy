import type { Metadata } from "next";
import { configuredOrigin } from "@/lib/config/origin";
const origin = configuredOrigin();
import "./globals.css";
export const metadata: Metadata = {
  title: "TastePolicy | AI that helps without replacing you",
  description:
    "Personal agency infrastructure for AI. Qloo understands what feels like you; TastePolicy respects your needs and decides how far an AI may go.",
  openGraph: {
    title: "TastePolicy — AI that helps without replacing you",
    description:
      "Personal agency infrastructure for AI: Qloo cultural understanding, your needs, and explicit authority boundaries.",
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
