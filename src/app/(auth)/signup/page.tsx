import { Suspense } from "react";
import { AuthForm } from "@/components/app/AuthForms";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
