import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

describe('ScanController route params', () => {
  let app: INestApplication<App>;
  const processScan = jest.fn().mockResolvedValue({ ok: true });
  const body = { consentGranted: true, consentVersion: '1.0' };

  beforeEach(async () => {
    processScan.mockClear();
    const module = await Test.createTestingModule({
      controllers: [ScanController],
      providers: [{ provide: ScanService, useValue: { processScan } }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects a petId that is not a UUID before reaching the service', async () => {
    await request(app.getHttpServer())
      .post('/scan/not-a-uuid')
      .send(body)
      .expect(400);
    expect(processScan).not.toHaveBeenCalled();
  });

  it('accepts a UUID petId', async () => {
    await request(app.getHttpServer())
      .post('/scan/8f14e45f-ceea-467a-9575-0c5b0b0b7c11')
      .send(body)
      .expect(201);
    expect(processScan).toHaveBeenCalledTimes(1);
  });
});
