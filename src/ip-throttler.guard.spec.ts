import { throttleKeyForIp } from './ip-throttler.guard';

describe('throttleKeyForIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '::ffff:203.0.113.7'],
    ['2001:0db8:85a3:0001:0000:8a2e:0370:7334', '2001:db8:85a3:1::/64'],
    ['2001:db8:85a3:1:ffff:ffff:ffff:ffff', '2001:db8:85a3:1::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['2001:DB8::', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['64:ff9b::192.0.2.1', '64:ff9b:0:0::/64'],
  ])('keys %s as %s', (ip, key) => {
    expect(throttleKeyForIp(ip)).toBe(key);
  });

  it('keeps every address of one /64 on the same key', () => {
    expect(throttleKeyForIp('2001:db8:1:2::a')).toBe(
      throttleKeyForIp('2001:db8:1:2:dead:beef:0:1'),
    );
  });
});
