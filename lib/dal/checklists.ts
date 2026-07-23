import "server-only";

import { asc, eq, inArray, max } from "drizzle-orm";

import { db } from "@/lib/db";
import { clientTasks, serviceTaskTemplates } from "@/lib/db/schema";
import { requireSession } from "./session";
import { logActivity } from "./activity";

/* ---------------------------------------------------------------------------
   Onboarding checklists.

   A checklist belongs to a catalogue service: put a client on Hosting and the
   five things we owe them (kickoff call, assets, DNS, credentials, go-live)
   appear on their task list, dated. Without this, "onboard a client totally"
   depends on somebody remembering all five every time.

   `offsetDays` is days from the attach date, so the checklist is a schedule
   rather than a pile of undated to-dos. Copies are ordinary client_tasks by the
   time they land, which means editing or deleting the template later never
   reaches back into a client's list — same copy-at-attach rule as pricing.
--------------------------------------------------------------------------- */

export type TaskTemplateItem = {
  id: string;
  serviceId: string;
  title: string;
  offsetDays: number;
  position: number;
};

export async function listTaskTemplates(serviceIds?: string[]): Promise<TaskTemplateItem[]> {
  await requireSession();

  // An explicit empty list means "none", not "all" — inArray with [] would be
  // an invalid query, and returning everything here would be the wrong answer.
  if (serviceIds && serviceIds.length === 0) return [];

  return db
    .select({
      id: serviceTaskTemplates.id,
      serviceId: serviceTaskTemplates.serviceId,
      title: serviceTaskTemplates.title,
      offsetDays: serviceTaskTemplates.offsetDays,
      position: serviceTaskTemplates.position,
    })
    .from(serviceTaskTemplates)
    .where(serviceIds ? inArray(serviceTaskTemplates.serviceId, serviceIds) : undefined)
    .orderBy(asc(serviceTaskTemplates.position), asc(serviceTaskTemplates.createdAt));
}

export async function addTaskTemplate(input: {
  serviceId: string;
  title: string;
  offsetDays: number;
}): Promise<{ id: string }> {
  const staff = await requireSession();

  const [{ highest }] = await db
    .select({ highest: max(serviceTaskTemplates.position) })
    .from(serviceTaskTemplates)
    .where(eq(serviceTaskTemplates.serviceId, input.serviceId));

  const [row] = await db
    .insert(serviceTaskTemplates)
    .values({
      serviceId: input.serviceId,
      title: input.title,
      offsetDays: input.offsetDays,
      position: (highest ?? 0) + 1,
    })
    .returning({ id: serviceTaskTemplates.id });

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "service",
    entityId: input.serviceId,
    action: "checklist.item_added",
    metadata: { templateId: row.id, title: input.title },
  });

  return row;
}

export async function deleteTaskTemplate(templateId: string): Promise<{ serviceId: string }> {
  const staff = await requireSession();

  const [row] = await db
    .delete(serviceTaskTemplates)
    .where(eq(serviceTaskTemplates.id, templateId))
    .returning({ serviceId: serviceTaskTemplates.serviceId, title: serviceTaskTemplates.title });

  if (!row) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "service",
    entityId: row.serviceId,
    action: "checklist.item_removed",
    metadata: { templateId, title: row.title },
  });

  return { serviceId: row.serviceId };
}

/**
 * Copy a service's checklist onto a client as real tasks. Called when a service
 * is attached; returns how many were created so the UI can say so.
 *
 * Deliberately not transactional with the attach itself: a checklist that fails
 * to materialise is a nuisance, a billing line that fails to save is a problem.
 * The attach wins, and the failure is logged rather than raised.
 */
export async function applyChecklist(input: {
  clientId: string;
  serviceId: string;
  startedAt: Date;
  createdBy: string;
}): Promise<number> {
  try {
    const templates = await db
      .select({
        title: serviceTaskTemplates.title,
        offsetDays: serviceTaskTemplates.offsetDays,
      })
      .from(serviceTaskTemplates)
      .where(eq(serviceTaskTemplates.serviceId, input.serviceId))
      .orderBy(asc(serviceTaskTemplates.position));

    if (templates.length === 0) return 0;

    await db.insert(clientTasks).values(
      templates.map((template) => {
        const dueAt = new Date(input.startedAt);
        dueAt.setDate(dueAt.getDate() + template.offsetDays);
        // 9am local: a task due "on the 3rd" that lands at midnight reads as
        // overdue for the whole working day it is actually due.
        dueAt.setHours(9, 0, 0, 0);
        return {
          clientId: input.clientId,
          title: template.title,
          dueAt,
          createdBy: input.createdBy,
        };
      }),
    );

    return templates.length;
  } catch (error) {
    console.error("[checklist] failed to apply template tasks", error);
    return 0;
  }
}
