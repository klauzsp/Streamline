import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Handover | Fund migration workspace",
  description:
    "Reviewed, reconciled and traceable fund administration migrations.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
