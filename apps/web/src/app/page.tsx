"use client";

import { GetStarted } from "@/components/get-started";
import { SearchLoop } from "@/components/search-loop";
import { useSession } from "@/lib/session";

export default function Home() {
  const { session } = useSession();

  if (!session) return <GetStarted />;
  return <SearchLoop />;
}
