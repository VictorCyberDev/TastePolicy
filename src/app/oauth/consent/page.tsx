import type { Metadata } from "next";
import OAuthConsent from "@/features/platform/OAuthConsent";
import "@/features/policy/policy.css";
export const metadata: Metadata = {
  title: "Connect an assistant · TastePolicy",
  robots: { index: false },
};
export default function Page() {
  return <OAuthConsent />;
}
