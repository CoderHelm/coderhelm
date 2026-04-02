"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type MinRole = "member" | "billing" | "admin" | "owner";

const ROLE_LEVEL: Record<string, number> = {
  viewer: 0,
  member: 1,
  billing: 2,
  admin: 3,
  owner: 4,
};

export function RoleGuard({ minRole, children }: { minRole: MinRole; children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    api.me().then((u) => {
      const level = ROLE_LEVEL[u.role] ?? 0;
      const required = ROLE_LEVEL[minRole] ?? 0;
      if (level >= required) {
        setAllowed(true);
      } else {
        router.replace("/settings");
      }
    }).catch(() => router.replace("/settings"));
  }, [minRole, router]);

  if (allowed === null) return null;
  return <>{children}</>;
}
