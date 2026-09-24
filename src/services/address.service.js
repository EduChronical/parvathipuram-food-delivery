import { withActorTx } from '../db.js';
import { HttpError } from '../http/errors.js';
import { requireActiveActor } from './authz.service.js';

export async function listAddresses(actorUserId, requestId) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId, 'customer');
    return (await client.query(`SELECT id,label,address_text,latitude,longitude,is_default,created_at,updated_at FROM saved_addresses WHERE customer_id=$1 ORDER BY is_default DESC,created_at DESC`, [actorUserId])).rows;
  });
}

export async function createAddress(actorUserId, requestId, input) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId, 'customer');
    await client.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE', [actorUserId]);
    if (input.isDefault) await client.query(`UPDATE saved_addresses SET is_default=false WHERE customer_id=$1 AND is_default`, [actorUserId]);
    const { rows } = await client.query(
      `INSERT INTO saved_addresses(customer_id,label,address_text,latitude,longitude,is_default)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [actorUserId,input.label,input.addressText,input.latitude,input.longitude,Boolean(input.isDefault)]
    );
    return rows[0];
  });
}

export async function updateAddress(actorUserId, requestId, addressId, input) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId, 'customer');
    await client.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE', [actorUserId]);
    const current = (await client.query(`SELECT * FROM saved_addresses WHERE id=$1 AND customer_id=$2 FOR UPDATE`, [addressId,actorUserId])).rows[0];
    if (!current) throw new HttpError(404,'ADDRESS_NOT_FOUND','Saved address not found.');
    const next = {
      label: input.label ?? current.label,
      addressText: input.addressText ?? current.address_text,
      latitude: input.latitude ?? Number(current.latitude),
      longitude: input.longitude ?? Number(current.longitude),
      isDefault: input.isDefault ?? current.is_default
    };
    if (next.isDefault) await client.query(`UPDATE saved_addresses SET is_default=false WHERE customer_id=$1 AND id<>$2 AND is_default`, [actorUserId,addressId]);
    return (await client.query(
      `UPDATE saved_addresses SET label=$3,address_text=$4,latitude=$5,longitude=$6,is_default=$7,updated_at=now()
       WHERE id=$1 AND customer_id=$2 RETURNING *`,
      [addressId,actorUserId,next.label,next.addressText,next.latitude,next.longitude,next.isDefault]
    )).rows[0];
  });
}

export async function deleteAddress(actorUserId, requestId, addressId) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId, 'customer');
    const used = (await client.query('SELECT id FROM orders WHERE address_id=$1 AND customer_id=$2 LIMIT 1', [addressId,actorUserId])).rows[0];
    if (used) throw new HttpError(409,'ADDRESS_IN_ORDER_HISTORY','This address is linked to an order and must remain available in order history.');
    const deleted = (await client.query(`DELETE FROM saved_addresses WHERE id=$1 AND customer_id=$2 RETURNING id`, [addressId,actorUserId])).rows[0];
    if (!deleted) throw new HttpError(404,'ADDRESS_NOT_FOUND','Saved address not found.');
    return { id: deleted.id, deleted: true };
  });
}
