import CompanyShell from "@/features/company/CompanyShell";
import type { Metadata } from "next";
import Developers from "@/features/policy/Developers";
export const metadata: Metadata = {
  title: "TastePolicy for developers",
  description: "Connect, control, enforce and verify subjective authority.",
};
export default function Page() {
  return (
    <CompanyShell>
      <Developers />
    </CompanyShell>
  );
}
