import CompanyShell from "@/features/company/CompanyShell";
import type { Metadata } from "next";
import Product from "@/features/policy/Product";
export const metadata: Metadata = {
  title: "TastePolicy — Your taste. Your rules. Any agent.",
  description:
    "The subjective authority layer for AI agents: Qloo gives agents taste; TastePolicy gives that taste authority boundaries.",
};
export default function Page() {
  return (
    <CompanyShell>
      <Product />
    </CompanyShell>
  );
}
