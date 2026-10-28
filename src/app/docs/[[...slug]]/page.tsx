import { notFound } from "next/navigation";
import DeveloperDocs, { DOC_TOPICS } from "@/features/company/DeveloperDocs";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  if (
    slug &&
    (slug.length !== 1 ||
      ![...DOC_TOPICS.map((t) => t.slug), "errors"].includes(slug[0]))
  )
    notFound();
  return <DeveloperDocs slug={slug?.[0]} />;
}
