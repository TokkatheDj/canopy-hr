import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelfEditForm } from "./self-edit-form";
import type { ApprovalStep } from "@/lib/approvals";

export const metadata = { title: "My Info" };

export default async function MyInfoPage() {
  const user = await currentUser();
  if (!user?.employeeId) {
    return (
      <p className="text-muted-foreground">
        Your account isn&apos;t linked to an employee record.
      </p>
    );
  }

  const emp = await db.employee.findUniqueOrThrow({
    where: { id: user.employeeId },
  });
  const pending = await db.approvalRequest.findMany({
    where: {
      requesterId: user.employeeId,
      type: "INFO_CHANGE",
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Info</h1>
          <p className="text-sm text-muted-foreground">
            Changes to your details are sent to your manager and HR for
            approval.
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/people/${emp.id}`} />}
        >
          View my full profile
        </Button>
      </div>

      {pending.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <CardHeader>
            <CardTitle className="text-base">
              Pending change requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((p) => {
              const steps = p.steps as unknown as ApprovalStep[];
              const waitingOn = steps.find((s) => s.status === "PENDING");
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span>{p.summary}</span>
                  <Badge variant="outline" className="text-amber-700">
                    waiting on {waitingOn?.approverName ?? "approval"}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contact details</CardTitle>
        </CardHeader>
        <CardContent>
          <SelfEditForm
            initial={{
              preferredName: emp.preferredName ?? "",
              personalEmail: emp.personalEmail ?? "",
              phone: emp.phone ?? "",
              address: emp.address ?? "",
              city: emp.city ?? "",
              state: emp.state ?? "",
              zip: emp.zip ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
