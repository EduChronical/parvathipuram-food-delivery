import { HttpError } from '../http/errors.js';

export function assertPaise(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) throw new HttpError(422, 'INVALID_MONEY', `${field} must be non-negative integer paise.`);
}

export function buildZeroCommissionSplit(order) {
  const food = Number(order.food_total_paise);
  const fee = Number(order.delivery_fee_paise);
  const tip = Number(order.tip_paise);
  const total = Number(order.total_paise);
  const platform = Number(order.platform_fee_paise);
  for (const [name, value] of Object.entries({ food, fee, tip, total, platform })) assertPaise(value, name);
  if (platform !== 0) throw new HttpError(500, 'FINANCIAL_INVARIANT', 'Platform fee must be zero.');
  if (food + fee + tip !== total) throw new HttpError(500, 'FINANCIAL_INVARIANT', 'Order total does not equal food + delivery fee + tip.');
  return Object.freeze({
    restaurantAmountPaise: food,
    riderAmountPaise: fee + tip,
    deliveryFeePaise: fee,
    tipPaise: tip,
    platformAmountPaise: 0,
    totalPaise: total
  });
}
