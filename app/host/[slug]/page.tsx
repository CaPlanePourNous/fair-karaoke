import HostClient from "./HostClient";

export default async function HostPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  // Next 15 : params est une Promise
  const { slug } = await params;
  return <HostClient slug={slug} />;
}
