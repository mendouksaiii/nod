import Link from "next/link";

// Placeholder landing — becomes the title screen ("the house learns your
// name") in Section 7.
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.2rem",
        background: "#07090d",
        color: "#9aa2b5",
        fontFamily: "Georgia, serif",
      }}
    >
      <h1 style={{ fontWeight: 400, letterSpacing: "0.5em", fontSize: "2rem" }}>
        N O D
      </h1>
      <p style={{ opacity: 0.6, fontStyle: "italic", fontSize: "0.95rem" }}>
        the stairs only go down
      </p>
      <Link
        href="/game"
        style={{
          marginTop: "1.5rem",
          color: "#c8d2be",
          textDecoration: "none",
          border: "1px solid #2a3040",
          padding: "0.6rem 2.2rem",
          fontSize: "0.9rem",
          letterSpacing: "0.2em",
        }}
      >
        wake
      </Link>
    </main>
  );
}
