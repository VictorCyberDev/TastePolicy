import Link from "next/link";
import Demo from "@/features/demo/Demo";
export default function Home() {
  return (
    <>
      <Demo />
      <nav aria-label="Platform account">
        <Link href="/account">
          Account · TastePolicy Passport · Developer access
        </Link>
      </nav>
    </>
  );
}
