import { Test, TestingModule } from '@nestjs/testing';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';

describe('PetsController', () => {
  let controller: PetsController;

  beforeEach(async () => {
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
      ],
    }).compile();

    controller = module.get<PetsController>(PetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
