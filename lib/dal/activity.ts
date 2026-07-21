import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { activityLog, staffUsers } from "@/lib/db/schema";
import { requireSession } from "./session";

type LogInput = {
  actorType: "staff" | "system";
  actorId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
};

/**
 * Audit trail. Never let a logging failure break the operation being logged —
 * a lead that saved but didn't log is fine; a lead lost to a logging bug is not.
 */
export async function logActivity(input: LogInput): Promise<void> {
  try {
    await db.insert(activityLog).values({
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.error("[activity-log] failed to write entry", {
      action: input.action,
      entityType: input.entityType,
      error,
    });
  }
}

export type ActivityItem = {
  id: string;
  actorType: "staff" | "system";
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  createdAt: Date;
};

export async function listActivity(limit = 100): Promise<ActivityItem[]> {
  await requireSession();

  return db
    .select({
      id: activityLog.id,
      actorType: activityLog.actorType,
      actorName: staffUsers.name,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      action: activityLog.action,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .leftJoin(staffUsers, eq(activityLog.actorId, staffUsers.id))
    .orderBy(desc(activityLog.createdAt))
    .limit(Math.min(limit, 250));
}
