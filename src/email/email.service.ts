import { Injectable } from '@nestjs/common';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class EmailService {
  private readonly client: BrevoClient;

  constructor() {
    this.client = new BrevoClient({
      apiKey: process.env.BREVO_API_KEY ?? '',
    });
  }

  async send(to: string, subject: string, message: string): Promise<boolean> {
    try {
      await this.client.transactionalEmails.sendTransacEmail({
        sender: {
          email: process.env.BREVO_SENDER_EMAIL ?? '',
          name: 'TagReativa',
        },
        subject,
        textContent: message,
        to: [{ email: to }],
      });
      return true;
    } catch (err) {
      console.error('[EMAIL] erro:', err);
      return false;
    }
  }
}
