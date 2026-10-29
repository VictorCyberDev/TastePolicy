import AssistedChoice from "@/features/experience/AssistedChoice";
import { LOW_ENERGY } from "@/features/experience/personas";

export const metadata = {
  title: "Low-energy day · TastePolicy",
  description:
    "I can only walk about ten minutes today. I still want somewhere enjoyable.",
};
export default function Page() {
  return <AssistedChoice persona={LOW_ENERGY} />;
}
