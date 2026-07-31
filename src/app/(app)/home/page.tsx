import { currentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const user = await currentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {user?.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">
          Here&apos;s what&apos;s happening at your company today.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard coming online</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Announcements, celebrations, who&apos;s out today, and your approvals
          inbox will appear here.
        </CardContent>
      </Card>
    </div>
  );
}
