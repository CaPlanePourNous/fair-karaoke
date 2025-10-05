import React from "react";
import HostClient from "./HostClient";

export default async function Page(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params; // ✅ Next 15 : params est une Promise
  return <HostClient slug={slug} />;
}
