import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { clientNotes, clients, staffUsers, type NoteKind } from "@/lib/db/schema";
import { requireSession } from "./session";
import { logActivity } from "./activity";

/* ---------------------------------------------------------------------------
   The relationship timeline.

   `clients.notes` is one growing blob: fine for "prefers email", useless for
   "when did we last speak to them and who was it". These entries are dated and
   attributed, so the history of a client is a list rather than a paragraph
   somebody has to date-stamp by hand.

   The blob stays where it is, as standing background on the client. It is not
   a log and this is not a bigger text field.
--------------------------------------------------------------------------- */

export type ClientNoteItem = {
  id: string;
  kind: NoteKind;
  body: string;
  authorName: string | null;
  occurredAt: Date;
  createdAt: Date;
};

export async function listClientNotes(clientId: string): Promise<ClientNoteItem[]> {
  await requireSession();

  return db
    .select({
      id: clientNotes.id,
      kind: clientNotes.kind,
      body: clientNotes.body,
      authorName: staffUsers.name,
      occurredAt: clientNotes.occurredAt,
      createdAt: clientNotes.createdAt,
    })
    .from(clientNotes)
    .leftJoin(staffUsers, eq(clientNotes.authorId, staffUsers.id))
    .where(eq(clientNotes.clientId, clientId))
    .orderBy(desc(clientNotes.occurredAt), desc(clientNotes.createdAt))
    .limit(200);
}

export async function addClientNote(input: {
  clientId: string;
  kind: NoteKind;
  body: string;
  occurredAt?: Date | null;
}): Promise<{ id: string }> {
  const staff = await requireSession();

  // Guard the FK so a stale client id is a 404, not a 500.
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);
  if (!client) throw new Error("NOT_FOUND");

  const [row] = await db
    .insert(clientNotes)
    .values({
      clientId: input.clientId,
      kind: input.kind,
      body: input.body,
      authorId: staff.id,
      // A call logged on Friday may have happened on Tuesday.
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning({ id: clientNotes.id });

  // Talking to a client is activity on that client.
  await db.update(clients).set({ updatedAt: new Date() }).where(eq(clients.id, input.clientId));

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: input.clientId,
    action: "note.added",
    metadata: { noteId: row.id, kind: input.kind },
  });

  return row;
}

export async function deleteClientNote(noteId: string): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [row] = await db
    .delete(clientNotes)
    .where(eq(clientNotes.id, noteId))
    .returning({ clientId: clientNotes.clientId });

  if (!row) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: row.clientId,
    action: "note.deleted",
    metadata: { noteId },
  });

  return row;
}
