import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppSidebar, MobileNav } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { FeedbackWidget } from "@/components/feedback-widget";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [unreadCount, recentFeedback] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  return (
    <div className="flex min-h-screen">
      <AppSidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar user={user} unreadCount={unreadCount} />
        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>
      <MobileNav user={user} />
      <FeedbackWidget
        recent={recentFeedback.map((f) => ({
          id: f.id,
          authorName: f.authorName,
          body: f.body,
          answer: f.answer,
          createdAt: f.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
