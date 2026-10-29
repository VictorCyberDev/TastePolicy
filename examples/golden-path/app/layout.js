export const metadata = {
  title: "TastePolicy developer example",
  description:
    "A server-side integration example with an offline four-outcome exercise.",
};
export default function Layout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui",
          maxWidth: 800,
          margin: "48px auto",
          padding: 24,
          lineHeight: 1.6,
        }}
      >
        {children}
      </body>
    </html>
  );
}
