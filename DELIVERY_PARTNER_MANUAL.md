# Delivery partner manual

Sign in, go online and allow location access when working. Location updates are stored server-side only for delivery operations.

Offers list nearby assignments. Accepting an offer is atomic: if another rider already secured it, the API rejects the attempt.

After acceptance, follow the lifecycle: arrive at restaurant, pickup, on the way, arrive at customer, delivered. The API prevents unrelated riders from changing an order.

Delivery completion creates earning records and reduces the active-delivery count. Customer address/contact data must be used only for the assigned delivery.

Use Support for pickup, navigation, payment or customer-contact problems rather than forcing an invalid order transition.
