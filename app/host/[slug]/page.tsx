import HostClient from "./HostClient";

export default async function HostPage(
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params; // Next 15 : params est une Promise
  return <HostClient roomId={roomId} />;
}
