import LotteryDisplay from "./screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { slug: string } }) {
  return <LotteryDisplay slug={params.slug} />;
}
