import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatPay } from "@/lib/history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OfferSignForm } from "./offer-sign-form";

export const metadata = { title: "Offer letter" };

export default async function PublicOfferPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const offer = await db.offerLetter.findUnique({
    where: { signToken: token },
    include: { candidate: { include: { opening: true } } },
  });
  if (!offer) notFound();

  const settings = await db.companySettings.findUnique({ where: { id: "singleton" } });
  const companyName = settings?.companyName ?? "Meridian Coffee Co.";
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          {companyName}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          Offer of employment — {offer.candidate.firstName} {offer.candidate.lastName}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {offer.title}
            {offer.signedAt && (
              <Badge className="ml-2 bg-emerald-100 text-emerald-800">signed</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Pay: </span>
              {formatPay(offer.payType, offer.salaryCents)}
            </div>
            <div>
              <span className="text-muted-foreground">Start date: </span>
              {fmtDate(offer.startDate)}
            </div>
            <div>
              <span className="text-muted-foreground">Offer sent: </span>
              {fmtDate(offer.sentAt)}
            </div>
          </div>
          <div className="whitespace-pre-line rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
            {offer.body}
          </div>

          {offer.signedAt ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950">
              <p className="font-serif text-lg italic">{offer.signedName}</p>
              <p className="mt-1 text-muted-foreground">
                Signed {fmtDate(offer.signedAt)} — welcome aboard! Our team will
                be in touch with next steps.
              </p>
            </div>
          ) : (
            <OfferSignForm token={token} />
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Questions about this offer? Reply to the email it was shared in and the
        {" "}{companyName} People Team will help.
      </p>
    </main>
  );
}
