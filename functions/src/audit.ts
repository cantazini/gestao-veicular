import type { AppUser } from "./auth.js";
import { serverTimestamp } from "./firebase.js";

export function auditEntry(actor: AppUser, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  return {
    actorUid: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actorEmail: actor.email,
    action,
    entityType,
    entityId,
    timestamp: serverTimestamp(),
    metadata
  };
}
