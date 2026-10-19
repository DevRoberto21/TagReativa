import { Prisma } from '@prisma/client';

// Error objects can carry request URLs (the Telegram one embeds the bot token),
// provider response bodies or query values with contact data, so logs only
// get the name and message, and Prisma errors only their code.
export function describeError(err: unknown): string {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientValidationError ||
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    return 'code' in err && err.code ? `${err.name} ${err.code}` : err.name;
  }
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return typeof err;
}
