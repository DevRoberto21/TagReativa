import { Test, TestingModule } from '@nestjs/testing';
import { PetsService } from './pets.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('PetsService', () => {
  let service: PetsService;
  let prisma: {
    pet: Record<string, jest.Mock>;
    scanLog: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      pet: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      scanLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [PetsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PetsService>(PetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('owner-bound writes', () => {
    const notFound = () =>
      new Prisma.PrismaClientKnownRequestError('No record found', {
        code: 'P2025',
        clientVersion: 'test',
      });
    const writes: [string, string, (s: PetsService) => Promise<unknown>][] = [
      ['updatePet', 'update', (s) => s.updatePet('pet-1', 'owner-1', {})],
      [
        'updateStatus',
        'update',
        (s) => s.updateStatus('pet-1', 'owner-1', 'LOST'),
      ],
      ['deletePet', 'delete', (s) => s.deletePet('pet-1', 'owner-1')],
    ];

    it.each(writes)(
      '%s filters the write by id and owner in one query',
      async (_name, method, call) => {
        prisma.pet[method].mockResolvedValue({ id: 'pet-1' });

        await call(service);

        expect(prisma.pet[method]).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'pet-1', ownerId: 'owner-1' },
          }),
        );
        expect(prisma.pet.findUnique).not.toHaveBeenCalled();
      },
    );

    it.each(writes)(
      '%s answers 403 for a pet of another owner',
      async (_name, method, call) => {
        prisma.pet[method].mockRejectedValue(notFound());
        prisma.pet.findUnique.mockResolvedValue({
          id: 'pet-1',
          ownerId: 'owner-2',
        });

        await expect(call(service)).rejects.toThrow(ForbiddenException);
      },
    );

    it.each(writes)(
      '%s answers 404 for a missing pet',
      async (_name, method, call) => {
        prisma.pet[method].mockRejectedValue(notFound());
        prisma.pet.findUnique.mockResolvedValue(null);

        await expect(call(service)).rejects.toThrow(NotFoundException);
      },
    );
  });

  describe('findScans', () => {
    it('returns at most 200 scans, newest first', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        id: 'pet-1',
        ownerId: 'owner-1',
      });

      await service.findScans('pet-1', 'owner-1');

      expect(prisma.scanLog.findMany).toHaveBeenCalledWith({
        where: { petId: 'pet-1' },
        orderBy: { timestamp: 'desc' },
        take: 200,
      });
    });
  });
});
