import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePetDto } from './create-pet.dto';
import { UpdatePetDto } from './update-pet.dto';

const VALID =
  'https://res.cloudinary.com/dan2bsmlk/image/upload/v1758650000/tagreativa/abc_123.jpg';

async function photoUrlErrors(cls: new () => object, photoUrl: unknown) {
  const dto = plainToInstance(cls, {
    name: 'Rex',
    species: 'Cachorro',
    photoUrl,
  });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'photoUrl');
}

describe.each([
  ['CreatePetDto', CreatePetDto],
  ['UpdatePetDto', UpdatePetDto],
])('%s photoUrl', (_, cls) => {
  it('accepts an upload URL from the project Cloudinary account', async () => {
    expect(await photoUrlErrors(cls, VALID)).toHaveLength(0);
  });

  it('accepts an omitted photoUrl', async () => {
    expect(await photoUrlErrors(cls, undefined)).toHaveLength(0);
  });

  it.each([
    ['another host', 'https://evil.example.com/image/upload/x.jpg'],
    [
      'another Cloudinary account',
      'https://res.cloudinary.com/othercloud/image/upload/x.jpg',
    ],
    ['plain http', VALID.replace('https://', 'http://')],
    ['a javascript: URL', 'javascript:alert(1)'],
    [
      'path traversal to another account',
      'https://res.cloudinary.com/dan2bsmlk/image/upload/../../othercloud/image/upload/x.jpg',
    ],
    [
      'encoded path traversal',
      'https://res.cloudinary.com/dan2bsmlk/image/upload/%2e%2e/%2e%2e/othercloud/x.jpg',
    ],
    [
      'a host suffix trick',
      'https://res.cloudinary.com.evil.example.com/dan2bsmlk/image/upload/x.jpg',
    ],
    [
      'a userinfo trick',
      'https://res.cloudinary.com@evil.example.com/dan2bsmlk/image/upload/x.jpg',
    ],
  ])('rejects %s', async (_, url) => {
    expect(await photoUrlErrors(cls, url)).toHaveLength(1);
  });
});
