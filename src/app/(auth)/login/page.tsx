import { AuthForm } from "@/components/app/AuthForms";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
