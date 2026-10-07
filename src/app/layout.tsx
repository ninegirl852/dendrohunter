import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";

const notoSansTC = Noto_Sans_TC({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto",
});

export const metadata: Metadata = {
  title: "城木獵人 Dendro-Hunter",
  description: "在香港大型公園地圖上尋樹、掃描、收集卡牌，並用肥料培育虛擬園圃。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-HK" className={`${notoSansTC.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden bg-black">{children}</body>
    </html>
  );
}
