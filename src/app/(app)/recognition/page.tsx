import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { RecognitionClient } from "./recognition-client";

export const metadata = { title: "Recognition" };

export default async function RecognitionPage() {
  const user = await currentUser();
  const meId = user?.employeeId ?? null;

  const [recognitions, coreValues, employees] = await Promise.all([
    db.recognition.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        giver: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        coreValue: true,
        recipients: {
          include: {
            employee: {
              select: { id: true, firstName: true, lastName: true, photoUrl: true },
            },
          },
        },
      },
    }),
    db.coreValue.findMany({ orderBy: { name: "asc" } }),
    db.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
  ]);

  let pointsReceived = 0;
  let pointsGivenThisMonth = 0;
  if (meId) {
    const received = await db.recognition.findMany({
      where: { recipients: { some: { employeeId: meId } } },
      select: { points: true },
    });
    pointsReceived = received.reduce((sum, r) => sum + r.points, 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const given = await db.recognition.findMany({
      where: { giverId: meId, createdAt: { gte: monthStart } },
      select: { points: true, _count: { select: { recipients: true } } },
    });
    pointsGivenThisMonth = given.reduce(
      (sum, r) => sum + r.points * r._count.recipients,
      0,
    );
  }

  const posts = recognitions.map((r) => ({
    id: r.id,
    message: r.message,
    points: r.points,
    createdAt: r.createdAt.toISOString(),
    giver: {
      id: r.giver.id,
      name: `${r.giver.firstName} ${r.giver.lastName}`,
      photoUrl: r.giver.photoUrl,
    },
    coreValue: r.coreValue
      ? { id: r.coreValue.id, name: r.coreValue.name, icon: r.coreValue.icon }
      : null,
    recipients: r.recipients.map((x) => ({
      id: x.employee.id,
      name: `${x.employee.firstName} ${x.employee.lastName}`,
      photoUrl: x.employee.photoUrl,
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recognition</h1>
        <p className="text-sm text-muted-foreground">
          Show some love for teammates doing great work.
        </p>
      </div>
      <RecognitionClient
        posts={posts}
        coreValues={coreValues.map((v) => ({ id: v.id, name: v.name, icon: v.icon }))}
        employees={employees.map((e) => ({
          id: e.id,
          name: `${e.firstName} ${e.lastName}`,
        }))}
        meId={meId}
        pointsReceived={pointsReceived}
        pointsGivenThisMonth={pointsGivenThisMonth}
      />
    </div>
  );
}
