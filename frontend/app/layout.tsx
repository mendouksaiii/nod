import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NOD",
  description: "The stairs only go down.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <body suppressHydrationWarning style={{ margin: 0, background: "#07090d" }}>
        {children}
      </body>
    </html>
  );
}
