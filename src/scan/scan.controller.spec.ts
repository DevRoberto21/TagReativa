import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

describe('ScanController', () => {
  let controller: ScanController;
  let processScan: jest.Mock;

  beforeEach(async () => {
    processScan = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScanController],
      providers: [{ provide: ScanService, useValue: { processScan } }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ScanController>(ScanController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('uses req.ip (resolved by trust proxy) instead of the raw x-forwarded-for header', () => {
    const req = {
      ip: '203.0.113.7',
      headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' },
    } as unknown as Request;

    void controller.scan('abc1234', { consentGranted: false } as never, req);

    expect(processScan).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: '203.0.113.7' }),
    );
  });
});
