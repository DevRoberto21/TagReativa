import { Test, TestingModule } from '@nestjs/testing';
import { PetsService } from './pets.service';
import { PrismaService } from '../prisma/prisma.service';

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
