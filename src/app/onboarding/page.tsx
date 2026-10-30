import HumanShell from "@/components/layout/HumanShell";
import Onboarding from "@/features/onboarding/Onboarding";

export const metadata = {
  title: "Set up your taste · TastePolicy",
  description:
    "Name five things you love, say what matters, and choose how far AI may go.",
};
export default function Page() {
  return (
    <HumanShell>
      <Onboarding />
    </HumanShell>
  );
}
