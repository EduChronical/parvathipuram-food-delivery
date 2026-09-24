# Admin manual

Sign in only with an administrator account created by the secure bootstrap command.

Dashboard: review 24-hour GMV, order counts, approved restaurants and online riders.

Restaurants: open pending applications, verify required documents/business data and approve or reject. Status changes are audit logged.

Delivery partners: verify KYC/document state before approval.

Support: review customer tickets, reply visibly, use internal notes only for staff context, and initiate refunds only within assigned permissions.

Finance: refunds use idempotency keys and create immutable refund records. Settlement/earning records are produced from completed orders.

Configuration: feature flags enable or disable COD, wallet, referrals, membership, scheduled delivery, pickup and tipping without code release.

Audit logs: review administrative/financial actions and investigate anomalous access rather than auto-banning permanently.
