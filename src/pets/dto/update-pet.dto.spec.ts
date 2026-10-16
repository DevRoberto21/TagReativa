import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePetDto } from './update-pet.dto';

describe('UpdatePetDto', () => {
  it.each(['name', 'species'])('rejects an explicit null %s', async (field) => {
    const errors = await validate(
      plainToInstance(UpdatePetDto, { [field]: null }),
    );
    expect(errors.map((e) => e.property)).toEqual([field]);
  });

  it('accepts a partial update without name or species', async () => {
    const errors = await validate(plainToInstance(UpdatePetDto, { age: 3 }));
    expect(errors).toHaveLength(0);
  });

  it('does not accept physicalFallbackConsent', async () => {
    const errors = await validate(
      plainToInstance(UpdatePetDto, { physicalFallbackConsent: true }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((e) => e.property)).toEqual(['physicalFallbackConsent']);
  });
});
