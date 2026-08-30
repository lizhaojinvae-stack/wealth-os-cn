import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WEALTH OS｜真实数据投资工作台",
  description:
    "融合真实行情、自选持仓、纪律策略、多模型AI辅助分析与金融知识课程的个人投资工作台。",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "WEALTH OS｜真实数据投资工作台",
    description: "看清市场 · 执行纪律 · 系统学习",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    locale: "zh_CN",
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
