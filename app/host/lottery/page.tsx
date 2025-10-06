import LotteryHost from "./LotteryHost";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  // défaut pratique si non fourni dans l’URL
  return <LotteryHost slug={(slug || "lantignie").toLowerCase()} />;
}
