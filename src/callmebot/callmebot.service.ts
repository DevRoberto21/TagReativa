import { Injectable } from '@nestjs/common';

@Injectable()
export class CallMeBotService {
  async send(
    whatsapp: string,
    apiKey: string,
    message: string,
  ): Promise<boolean> {
    const phone = whatsapp.replace(/\D/g, '');
    const encoded = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encoded}&apikey=${apiKey}`;

    try {
      console.log('[CALLMEBOT] URL:', url);
      const res = await fetch(url);
      const text = await res.text();
      console.log('[CALLMEBOT] status:', res.status, '| body:', text);

      if (!res.ok || text.toLowerCase().includes('error')) return false;
      return true;
    } catch (err) {
      console.error('[CALLMEBOT] fetch error:', err);
      return false;
    }
  }
}
