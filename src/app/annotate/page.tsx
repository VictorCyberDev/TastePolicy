import type { Metadata } from "next";
import Annotation from "@/features/arena/Annotation";
export const metadata: Metadata = {
  title: "Assistant decision study",
  description:
    "Decide what an AI assistant should do in a set of short situations.",
};
export default function AnnotationPage() {
  return <Annotation />;
}
