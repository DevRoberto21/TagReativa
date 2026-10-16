import { Prisma } from '@prisma/client';
import { describeError } from './describe-error';

describe('describeError', () => {
  it('keeps only the name and message of an Error', () => {
    const err = new Error('fetch failed', {
      cause: new Error('https://api.telegram.org/botSECRET/sendMessage'),
    });

    expect(describeError(err)).toBe('Error: fetch failed');
  });

  it('reduces a Prisma error to its code, dropping the query values', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on whatsapp 5511999999999',
      { code: 'P2002', clientVersion: 'test' },
    );

    expect(describeError(err)).toBe('PrismaClientKnownRequestError P2002');
  });

  it('never prints a thrown non-Error value', () => {
    expect(describeError({ email: 'owner@example.com' })).toBe('object');
  });
});
