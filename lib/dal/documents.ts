import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clientDocuments,
  clients,
  staffUsers,
  type DocumentKind,
} from "@/lib/db/schema";
import { requireSession } from "./session";
import { logActivity } from "./activity";

/* ---------------------------------------------------------------------------
   Client documents — the contract, the brief, the signed quote.

   Links rather than uploads. There is no blob storage in this stack, and the
   team already works out of Drive; a second copy here would go stale the first
   time someone edits the original. What was missing was a place on the client
   record that says which file is the contract.
--------------------------------------------------------------------------- */

export type ClientDocumentItem = {
  id: string;
  label: string;
  url: string;
  kind: DocumentKind;
  addedByName: string | null;
  createdAt: Date;
};

export async function listClientDocuments(clientId: string): Promise<ClientDocumentItem[]> {
  await requireSession();

  return db
    .select({
      id: clientDocuments.id,
      label: clientDocuments.label,
      url: clientDocuments.url,
      kind: clientDocuments.kind,
      addedByName: staffUsers.name,
      createdAt: clientDocuments.createdAt,
    })
    .from(clientDocuments)
    .leftJoin(staffUsers, eq(clientDocuments.addedBy, staffUsers.id))
    .where(eq(clientDocuments.clientId, clientId))
    .orderBy(desc(clientDocuments.createdAt))
    .limit(100);
}

export async function addClientDocument(input: {
  clientId: string;
  label: string;
  url: string;
  kind: DocumentKind;
}): Promise<{ id: string }> {
  const staff = await requireSession();

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);
  if (!client) throw new Error("NOT_FOUND");

  const [row] = await db
    .insert(clientDocuments)
    .values({
      clientId: input.clientId,
      label: input.label,
      url: input.url,
      kind: input.kind,
      addedBy: staff.id,
    })
    .returning({ id: clientDocuments.id });

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: input.clientId,
    action: "document.added",
    metadata: { documentId: row.id, label: input.label, kind: input.kind },
  });

  return row;
}

export async function deleteClientDocument(documentId: string): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [row] = await db
    .delete(clientDocuments)
    .where(eq(clientDocuments.id, documentId))
    .returning({ clientId: clientDocuments.clientId, label: clientDocuments.label });

  if (!row) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: row.clientId,
    action: "document.removed",
    metadata: { documentId, label: row.label },
  });

  return { clientId: row.clientId };
}
