import { getTripAccessOrNotFound } from "@/lib/collaboration";
import { requireUser } from "@/lib/auth/session";

type TripScopedLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>;

export default async function TripScopedLayout({
  children,
  params,
}: TripScopedLayoutProps) {
  const { id } = await params;
  const user = await requireUser();

  await getTripAccessOrNotFound(id, user);

  return children;
}
