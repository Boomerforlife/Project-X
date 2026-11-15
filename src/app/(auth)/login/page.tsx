import { Suspense } from "react";
import { AuthForm } from "@/components/app/AuthForms";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
