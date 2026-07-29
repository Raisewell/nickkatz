"use client";

import { Protected } from "@/components/protected";
import { SearchLoop } from "@/components/search-loop";

export default function Home() {
  return (
    <Protected>
      <SearchLoop />
    </Protected>
  );
}
