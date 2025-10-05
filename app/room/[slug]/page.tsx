import React from "react";
import RoomClient from "./RoomClient";

export default async function Page(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params; // ✅ Next 15 : params est une Promise
  return <RoomClient slug={slug} />;
}
