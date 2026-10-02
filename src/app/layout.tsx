import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PLT Quiz", template: "%s · PLT Quiz" },
  description: "Find the green job that fits you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
