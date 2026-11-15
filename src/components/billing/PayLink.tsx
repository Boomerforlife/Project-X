"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicPaymentLink } from "@projectx/contracts";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { createLinkOrder, formatInr, publicPaymentLink } from "@/lib/api/billing";
import { apiEnabled } from "@/lib/api/env";
import { openCheckout } from "@/lib/billing/checkout";

/** Parent payment page: no sign-in. The payer sees only the plan, price and the student's first name. */
export function PayLink({ token }: { token: string }) {
  const [link, setLink] = useState<PublicPaymentLink | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "paying" | "waiting" | "done" | "error">(() => (apiEnabled() ? "loading" : "missing"));
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!apiEnabled()) return;
    publicPaymentLink(token)
      .then((l) => {
        setLink(l);
        setState(l.status === "PAID" ? "done" : "ready");
      })
      .catch(() => setState("missing"));
  }, [token]);

  // After checkout, poll the public link until the webhook marks it paid.
  useEffect(() => {
    if (state !== "waiting") return;
    let n = 0;
    const id = setInterval(() => {
      n++;
      publicPaymentLink(token)
        .then((l) => {
          if (l.status === "PAID") {
            setLink(l);
            setState("done");
          }
        })
        .catch(() => undefined);
      if (n > 36) {
        clearInterval(id);
        setMessage("Payment submitted. Confirmation can take a few minutes; Plus is added automatically once it arrives. You don't need to pay again.");
      }
    }, 2500);
    return () => clearInterval(id);
  }, [state, token]);

  if (state === "loading") return <Frame title="Loading…" />;
  if (state === "missing" || !link) return <Frame title="This link doesn't work" body="It may have been typed incorrectly. Ask for a new link." />;
  const who = link.student_first_name ?? "a student";
  if (state === "done") return <Frame title="Thank you" body={`Payment confirmed. ${link.plan.name} is now active for ${who}.`} />;
  if (link.status === "EXPIRED") return <Frame title="This link has expired" body="Links last 7 days. Ask for a new one." />;

  async function pay() {
    setState("paying");
    setMessage(null);
    try {
      const order = await createLinkOrder(token);
      const r = await openCheckout(order, { description: `${link!.plan.name} for ${who}` });
      if (r === "submitted") setState("waiting");
      else {
        setState("ready");
        setMessage("Payment window closed. Nothing was charged unless you completed the payment.");
      }
    } catch {
      setState("ready");
      setMessage("Couldn't start the payment. Nothing was charged. Please try again in a minute.");
    }
  }

  return (
    <Frame title={`Pay for ${who}'s ${link.plan.name}`} body={`${link.plan.duration_days} days of Plus, paid once. It does not renew.`}>
      <p className="text-3xl font-semibold">{formatInr(link.plan.price_paise)}</p>
      <Button className="mt-5 w-full" onClick={() => void pay()} disabled={!link.payments_enabled || state === "paying" || state === "waiting"}>
        {state === "waiting" ? "Confirming…" : state === "paying" ? "Opening checkout…" : "Pay with Razorpay"}
      </Button>
      {message ? (
        <p role="status" className="mt-3 text-sm text-fg-muted">
          {message}
        </p>
      ) : null}
      <p className="mt-5 text-xs text-fg-muted">
        By paying you confirm you are an adult or have a guardian&apos;s consent. Link expires {new Date(link.expires_at).toLocaleDateString("en-IN")}. See the{" "}
        <Link className="underline" href="/refund-policy/">
          refund policy
        </Link>
        .
      </p>
    </Frame>
  );
}

function Frame({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <Card className="p-8">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        {body ? <p className="mt-3 text-fg-muted">{body}</p> : null}
        {children ? <div className="mt-6">{children}</div> : null}
      </Card>
    </div>
  );
}
