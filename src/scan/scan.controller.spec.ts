import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

describe('ScanController', () => {
  let controller: ScanController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScanController],
      providers: [{ provide: ScanService, useValue: { processScan: jest.fn() } }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ScanController>(ScanController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
