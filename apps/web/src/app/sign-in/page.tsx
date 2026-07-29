import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense>
        <SignInForm />
      </Suspense>
    </div>
  );
}
