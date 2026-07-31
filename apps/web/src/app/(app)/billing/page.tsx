import { Suspense } from "react";
import { BillingContent } from "./billing-content";

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}
