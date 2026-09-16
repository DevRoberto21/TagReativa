import { Injectable } from '@nestjs/common';
import * as brevo from '@getbrevo/brevo';

@Injectable()
export class EmailService {
  private readonly apiInstance: brevo.TransactionalEmailsApi;

  constructor() {
    this.apiInstance = new brevo.TransactionalEmailsApi();
    this.apiInstance.setApiKey(
      brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY ?? '',
    );
  }

  async send(to: string, subject: string, message: string): Promise<boolean> {
    const email = new brevo.SendSmtpEmail();
    email.subject = subject;
    email.textContent = message;
    email.sender = {
      email: process.env.BREVO_SENDER_EMAIL ?? '',
      name: 'TagReativa',
    };
    email.to = [{ email: to }];

    try {
      await this.apiInstance.sendTransacEmail(email);
      return true;
    } catch (err) {
      console.error('[EMAIL] erro:', err);
      return false;
    }
  }
}
