import Link from "next/link";
import Demo from "@/features/demo/Demo";
export default function Home() {
  return (
    <>
      <Demo />
      <nav className="app-shell" aria-label="TastePolicy">
        <Link href="/arena">Decision Arena · start the judge proof</Link>
        {" · "}
        <Link href="/account">
          Account · TastePolicy Passport · Developer access
        </Link>
        {" · "}
        <Link href="/product">Product</Link>
        {" · "}
        <Link href="/developers">Developers</Link>
      </nav>
    </>
  );
}
