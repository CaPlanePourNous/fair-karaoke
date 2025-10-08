import { RoomQueueView } from "./view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function Page({ params }: { params: { slug: string } }) {
  return <RoomQueueView slug={decodeURIComponent(params.slug)} />;
}
