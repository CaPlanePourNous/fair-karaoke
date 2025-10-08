import { RoomQueueView } from "./view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Next 15: params est une Promise
export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  return <RoomQueueView slug={decodeURIComponent(slug)} />;
}
