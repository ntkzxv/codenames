import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#090d16",
};

export const metadata: Metadata = {
  title: "Codenames Thai (โค้ดเนมส์) — บอร์ดเกมคำใบ้สายลับออนไลน์",
  description: "เกมคำใบ้ภาษาไทยแบบสองจอ เล่นร่วมกันแบบเรียลไทม์ระหว่างจอ Spymaster และจอกระดานผู้เล่น",
  keywords: ["codenames", "โค้ดเนมส์", "เกมคำใบ้", "บอร์ดเกม", "ปาร์ตี้เกม", "spymaster"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col selection:bg-rose-500/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
