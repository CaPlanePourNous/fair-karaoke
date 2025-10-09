// app/display/lottery/[slug]/page.tsx
import LotteryDisplay from "./screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <LotteryDisplay slug={slug} />;
}
