import { config } from '../config.js';

export class SmsProvider {
  constructor({ url = config.smsProviderUrl, apiKey = config.smsProviderApiKey, senderId = config.smsSenderId } = {}) {
    this.url = url;
    this.apiKey = apiKey;
    this.senderId = senderId;
  }

  async send({ to, text, templateKey, metadata = {} }) {
    if (!this.url) throw new Error('SMS_PROVIDER_URL is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${this.apiKey}`,
          'idempotency-key': metadata.idempotencyKey ?? `${templateKey}:${to}:${metadata.notificationId ?? ''}`
        },
        body: JSON.stringify({ to, senderId: this.senderId, text, templateKey, metadata }),
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`SMS provider ${response.status}: ${body.slice(0, 500)}`);
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch {}
      return { providerReference: parsed.id ?? parsed.reference ?? null };
    } finally {
      clearTimeout(timeout);
    }
  }
}
