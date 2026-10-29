import AssistedChoice from "@/features/experience/AssistedChoice";
import { SENSORY } from "@/features/experience/personas";

export const metadata = {
  title: "Sensory-aware night out · TastePolicy",
  description:
    "Same boundary, different need: quiet is a requirement, not a diagnosis. Taste still leads.",
};
export default function Page() {
  return <AssistedChoice persona={SENSORY} />;
}
