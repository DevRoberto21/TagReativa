import { Test, TestingModule } from '@nestjs/testing';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

describe('PetsController', () => {
  let controller: PetsController;
  let cloudinaryService: { generateUploadSignature: jest.Mock };

  beforeEach(async () => {
    cloudinaryService = { generateUploadSignature: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PetsController],
      providers: [
        {
          provide: PetsService,
          useValue: {
            create: jest.fn(),
            findAllByOwner: jest.fn(),
            findOne: jest.fn(),
            updatePet: jest.fn(),
            deletePet: jest.fn(),
            updateStatus: jest.fn(),
            findScans: jest.fn(),
          },
        },
        { provide: CloudinaryService, useValue: cloudinaryService },
      ],
    }).compile();

    controller = module.get<PetsController>(PetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getPhotoUploadSignature delegates to CloudinaryService', () => {
    const mockSignature = {
      signature: 'abc',
      timestamp: 123,
      apiKey: 'key',
      cloudName: 'dan2bsmlk',
      uploadPreset: 'tagreativa_pictures',
    };
    cloudinaryService.generateUploadSignature.mockReturnValue(mockSignature);

    const result = controller.getPhotoUploadSignature();

    expect(result).toEqual(mockSignature);
    expect(cloudinaryService.generateUploadSignature).toHaveBeenCalledTimes(1);
  });
});
