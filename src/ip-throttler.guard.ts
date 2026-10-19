import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { isIPv6 } from 'net';

// An IPv6 client usually owns a whole routed /64 and can rotate addresses
// inside it freely, so limits are keyed on the prefix instead.
export function throttleKeyForIp(ip: string): string {
  const addr = ip.split('%')[0];
  if (!isIPv6(addr) || /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(addr)) return ip;

  const groups = (part: string) => (part ? part.split(':') : []);
  // An embedded dotted IPv4 tail takes the room of two hextets.
  const width = (parts: string[]) =>
    parts.reduce((n, p) => n + (p.includes('.') ? 2 : 1), 0);

  const [head, tail] = addr.split('::');
  const headParts = groups(head);
  const tailParts = tail === undefined ? [] : groups(tail);
  const zeros = Array<string>(8 - width(headParts) - width(tailParts)).fill(
    '0',
  );

  const prefix = [...headParts, ...zeros, ...tailParts]
    .slice(0, 4)
    .map((h) => parseInt(h, 16).toString(16));
  return `${prefix.join(':')}::/64`;
}

@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(throttleKeyForIp(String(req.ip)));
  }
}
