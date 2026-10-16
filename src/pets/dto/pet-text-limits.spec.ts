import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePetDto } from './create-pet.dto';
import { UpdatePetDto } from './update-pet.dto';

describe('pet free-text limits', () => {
  const oversized = {
    name: 'N'.repeat(61),
    species: 'S'.repeat(41),
    breed: 'B'.repeat(61),
    notes: 'O'.repeat(1001),
  };
  const atLimit = {
    name: 'N'.repeat(60),
    species: 'S'.repeat(40),
    breed: 'B'.repeat(60),
    notes: 'O'.repeat(1000),
  };
  const dtos: [string, ClassConstructor<object>][] = [
    ['CreatePetDto', CreatePetDto],
    ['UpdatePetDto', UpdatePetDto],
  ];

  it.each(dtos)('%s rejects oversized text fields', async (_name, Dto) => {
    const errors = await validate(plainToInstance(Dto, oversized));
    expect(errors.map((e) => e.property).sort()).toEqual([
      'breed',
      'name',
      'notes',
      'species',
    ]);
  });

  it.each(dtos)('%s accepts text fields at the limit', async (_name, Dto) => {
    expect(await validate(plainToInstance(Dto, atLimit))).toHaveLength(0);
  });
});
