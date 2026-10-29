import HumanShell from "@/components/layout/HumanShell";
import PersonalAgencyHome from "@/features/home/PersonalAgencyHome";

export const metadata = {
  title: "Your home · TastePolicy",
  description:
    "Your taste, what matters right now, what needs your answer and how far AI may go.",
};
export default function Page() {
  return (
    <HumanShell>
      <PersonalAgencyHome />
    </HumanShell>
  );
}
