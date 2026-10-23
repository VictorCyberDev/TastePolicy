import Link from "next/link";
import Demo from "@/features/demo/Demo";
export default function Home() {
  return (
    <>
      <Demo />
      <nav className="app-shell">
        <Link href="/arena">Decision Arena · start the judge proof</Link>
      </nav>
    </>
  );
}
