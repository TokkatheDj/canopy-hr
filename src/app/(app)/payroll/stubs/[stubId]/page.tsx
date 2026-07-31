import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/history";
import type { StubLines } from "@/lib/payroll/engine";
import { Card, CardContent } from "@/components/ui/card";
import { PrintButton } from "./print-button";
import { Leaf } from "lucide-react";

export const metadata = { title: "Pay Stub" };

export default async function PayStubPage({
  params,
}: {
  params: Promise<{ stubId: string }>;
}) {
  const { stubId } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");

  const stub = await db.payStub.findUnique({
    where: { id: stubId },
    include: {
      employee: { include: { department: true } },
      run: true,
    },
  });
  if (!stub) notFound();

  // Only HR admins and the stub's owner may view it
  if (user.role !== "ADMIN" && user.employeeId !== stub.employeeId) {
    redirect("/home");
  }

  const settings = await db.companySettings.findUnique({ where: { id: "singleton" } });
  const lines = stub.lines as unknown as StubLines;

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-2xl space-y-4 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold tracking-tight">Pay stub</h1>
        <PrintButton />
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardContent className="space-y-6 p-6">
          {/* Header */}
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <div className="flex items-center gap-1.5 text-lg font-bold text-emerald-700">
                <Leaf className="size-5" /> {settings?.companyName ?? "Canopy HR"}
              </div>
              <p className="text-xs text-muted-foreground">{settings?.address}</p>
              {settings?.ein && (
                <p className="text-xs text-muted-foreground">EIN {settings.ein}</p>
              )}
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold">Earnings statement</div>
              <div className="text-muted-foreground">
                Period {fmt(stub.run.periodStart)} – {fmt(stub.run.periodEnd)}
              </div>
              <div className="text-muted-foreground">Pay date {fmt(stub.run.payDate)}</div>
            </div>
          </div>

          {/* Employee */}
          <div className="text-sm">
            <div className="font-semibold">
              {stub.employee.firstName} {stub.employee.lastName}
            </div>
            <div className="text-muted-foreground">
              {stub.employee.department?.name} · {stub.employee.workEmail}
            </div>
          </div>

          {/* Earnings */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Earnings
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {lines.earnings.map((e) => (
                  <tr key={e.label} className="border-b border-dashed last:border-0">
                    <td className="py-1.5">{e.label}</td>
                    <td className="py-1.5 text-right text-muted-foreground">
                      {e.hours !== undefined &&
                        e.rateCents !== undefined &&
                        `${e.hours}h × ${formatMoney(e.rateCents)}`}
                    </td>
                    <td className="py-1.5 text-right font-medium">
                      {formatMoney(e.amountCents)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-2 font-semibold">Gross pay</td>
                  <td />
                  <td className="pt-2 text-right font-semibold">
                    {formatMoney(lines.grossCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Deductions */}
          {lines.deductions.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Pre-tax deductions
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  {lines.deductions.map((d) => (
                    <tr key={d.label} className="border-b border-dashed last:border-0">
                      <td className="py-1.5">{d.label}</td>
                      <td className="py-1.5 text-right">
                        −{formatMoney(d.amountCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Taxes */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Taxes (simulated)
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {lines.taxes.map((t) => (
                  <tr key={t.label} className="border-b border-dashed last:border-0">
                    <td className="py-1.5">{t.label}</td>
                    <td className="py-1.5 text-right text-muted-foreground">
                      {(t.rate * 100).toFixed(2)}%
                    </td>
                    <td className="py-1.5 text-right">−{formatMoney(t.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Net */}
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 dark:bg-emerald-950">
            <span className="font-semibold">Net pay</span>
            <span className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
              {formatMoney(lines.netCents)}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            This is a simulated earnings statement generated by a demo
            application. Tax figures use illustrative flat rates and do not
            represent real withholding.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
