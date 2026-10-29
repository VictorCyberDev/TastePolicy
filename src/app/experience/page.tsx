import AssistedChoice from "@/features/experience/AssistedChoice";
import { MARGARET } from "@/features/experience/personas";

export const metadata = {
  title: "Assisted Choice · Meet Margaret · TastePolicy",
  description:
    "Margaret's mobility changed. Her taste didn't. Watch Qloo understand her taste while TastePolicy protects her agency.",
};
export default function ExperiencePage() {
  return <AssistedChoice persona={MARGARET} />;
}
