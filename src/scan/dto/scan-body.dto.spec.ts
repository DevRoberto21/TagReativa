import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ScanBodyDto } from './scan-body.dto';

describe('ScanBodyDto', () => {
  it('accepts the version the frontend sends', async () => {
    const dto = plainToInstance(ScanBodyDto, {
      consentGranted: true,
      consentVersion: '1.0',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an oversized consentVersion', async () => {
    const dto = plainToInstance(ScanBodyDto, {
      consentGranted: true,
      consentVersion: 'A'.repeat(17),
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['consentVersion']);
  });
});
