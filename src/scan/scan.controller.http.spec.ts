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

  it.each([
    ['a UUID', '8f14e45f-ceea-467a-9575-0c5b0b0b7c11'],
    ['a short code', 'AB12CD34'],
    ['a lower-case short code', 'ab12cd34'],
  ])('accepts %s', async (_label, petId) => {
    await request(app.getHttpServer())
      .post(`/scan/${petId}`)
      .send(body)
      .expect(201);
    expect(processScan).toHaveBeenCalledWith(
      expect.objectContaining({ petId }),
    );
  });

  it.each([
    ['a path traversal', '..%2Fauth'],
    ['a short code with a non-Crockford letter', 'AB12CD3U'],
    ['a short code of the wrong length', 'AB12CD345'],
  ])('rejects %s before reaching the service', async (_label, petId) => {
    await request(app.getHttpServer())
      .post(`/scan/${petId}`)
      .send(body)
      .expect(400);
    expect(processScan).not.toHaveBeenCalled();
  });
});
