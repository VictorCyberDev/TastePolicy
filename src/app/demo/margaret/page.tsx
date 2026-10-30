import AssistedChoice from "@/features/experience/AssistedChoice";
import { MARGARET } from "@/features/experience/personas";

export const metadata = {
  title: "Example · Meet Margaret · TastePolicy",
  description:
    "An example, not a real person: Margaret's mobility changed. Her taste didn't. Watch Qloo understand her taste while TastePolicy protects her agency.",
};
export default function MargaretExamplePage() {
  return <AssistedChoice persona={MARGARET} />;
}
