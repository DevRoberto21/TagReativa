import { Test, TestingModule } from '@nestjs/testing';
import { PetsService } from './pets.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Prisma } from '@prisma/client';

describe('PetsService', () => {
  let service: PetsService;
  let prisma: {
    pet: Record<string, jest.Mock>;
    scanLog: { findMany: jest.Mock };
  };
  let cloudinary: { isOwnedPhotoUrl: jest.Mock; deleteUnusedPhotos: jest.Mock };

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
    cloudinary = {
      isOwnedPhotoUrl: jest.fn().mockReturnValue(true),
      deleteUnusedPhotos: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
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

  describe('photos', () => {
    const oldUrl =
      'https://res.cloudinary.com/dan2bsmlk/image/upload/v1/old.jpg';
    const newUrl =
      'https://res.cloudinary.com/dan2bsmlk/image/upload/v2/pets/owner-1/new.jpg';
    const storedPet = { id: 'pet-1', ownerId: 'owner-1', photoUrl: oldUrl };

    it('rejects a new pet whose photo was not uploaded by the owner', async () => {
      cloudinary.isOwnedPhotoUrl.mockReturnValue(false);

      await expect(
        service.create('owner-1', {
          name: 'Rex',
          species: 'dog',
          photoUrl: newUrl,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(cloudinary.isOwnedPhotoUrl).toHaveBeenCalledWith(
        newUrl,
        'owner-1',
      );
      expect(prisma.pet.create).not.toHaveBeenCalled();
    });

    it('accepts an edit that resends the current photo, even an old one', async () => {
      cloudinary.isOwnedPhotoUrl.mockReturnValue(false);
      prisma.pet.findUnique.mockResolvedValue(storedPet);
      prisma.pet.update.mockResolvedValue(storedPet);

      await service.updatePet('pet-1', 'owner-1', { photoUrl: oldUrl });

      expect(prisma.pet.update).toHaveBeenCalled();
      expect(cloudinary.deleteUnusedPhotos).not.toHaveBeenCalled();
    });

    it('rejects an edit to a photo the owner did not upload', async () => {
      cloudinary.isOwnedPhotoUrl.mockReturnValue(false);
      prisma.pet.findUnique.mockResolvedValue(storedPet);

      await expect(
        service.updatePet('pet-1', 'owner-1', { photoUrl: newUrl }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pet.update).not.toHaveBeenCalled();
    });

    it('deletes the replaced photo after the edit is saved', async () => {
      prisma.pet.findUnique.mockResolvedValue(storedPet);
      prisma.pet.update.mockResolvedValue({ ...storedPet, photoUrl: newUrl });

      await service.updatePet('pet-1', 'owner-1', { photoUrl: newUrl });

      expect(cloudinary.deleteUnusedPhotos).toHaveBeenCalledWith([oldUrl]);
      expect(
        cloudinary.deleteUnusedPhotos.mock.invocationCallOrder[0],
      ).toBeGreaterThan(prisma.pet.update.mock.invocationCallOrder[0]);
    });

    it('deletes the photo of a deleted pet', async () => {
      prisma.pet.delete.mockResolvedValue(storedPet);

      await service.deletePet('pet-1', 'owner-1');

      expect(cloudinary.deleteUnusedPhotos).toHaveBeenCalledWith([oldUrl]);
    });
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
        select: {
          id: true,
          petId: true,
          latitude: true,
          longitude: true,
          locationSource: true,
          consentGranted: true,
          consentVersion: true,
          timestamp: true,
          alertSent: true,
        },
      });
    });
  });
});
