import { withActorTx } from '../db.js';
import { requireActiveActor } from './authz.service.js';

// Use the canonical public schema and the same transaction/RLS identity as Phase 2.
export function withPhase4ActorTx(userId, role, requestId, fn) {
  return withActorTx(userId, requestId, async client => {
    await requireActiveActor(client, userId, role);
    return fn(client);
  });
}
