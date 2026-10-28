import type { Metadata } from "next";
import { serverEnvironment } from "@/lib/env/server";
import "./globals.css";
export const metadata: Metadata = {
  title: "TastePolicy | Qloo Cultural Intelligence Demo",
  description: "Cultural intelligence and authorization for autonomous agents.",
  ...(serverEnvironment.appUrl
    ? { metadataBase: new URL(serverEnvironment.appUrl) }
    : {}),
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
