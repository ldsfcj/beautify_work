import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GenerateController } from './generate.controller';
import { GenerateService } from './generate.service';
import type { Queue } from 'bullmq';
import { CreditLedgerService } from '../credit/creditledger.service';
import { Generation } from '../entities/generation.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { NotificationService } from '../notification/notification.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';

/**
 * Thin controller tests. The 50ms contract lives in the service
 * spec; here we just verify the controller wires the JWT user id
 * and the body shape through to GenerateService.submit correctly,
 * and that errors surface with the right HTTP status.
 */
describe('GenerateController', () => {
  let controller: GenerateController;
  let service: jest.Mocked<Pick<GenerateService, 'submit'>>;
  const USER = { id: 'user-1', type: 'user' as const };

  beforeEach(async () => {
    service = { submit: jest.fn() } as any;
    service.submit.mockResolvedValue({ generation_id: 'gen-1', balance_after: 8 });

    // Build a minimal module so the controller can be instantiated.
    const moduleRef = await Test.createTestingModule({
      controllers: [GenerateController],
      providers: [
        { provide: GenerateService, useValue: service },
        // The service's own deps aren't injected through the controller,
        // but Nest will still need *something* if the controller
        // constructor asks for it. Our controller only takes the
        // service, so we're done.
      ],
    }).compile();

    controller = moduleRef.get(GenerateController);
  });

  it('POST /submit returns { generation_id, balance_after } from the service', async () => {
    const r = await controller.submit(USER as any, {
      image_url: 'https://oss.example.com/u1.jpg',
      preset_keys: ['nose_bridge_lift'],
    });
    expect(r).toEqual({ generation_id: 'gen-1', balance_after: 8 });
    expect(service.submit).toHaveBeenCalledWith('user-1', {
      image_url: 'https://oss.example.com/u1.jpg',
      preset_keys: ['nose_bridge_lift'],
      text: undefined,
    });
  });

  it('INSUFFICIENT_CREDITS bubbles as 402', async () => {
    service.submit.mockRejectedValueOnce(
      new HttpException(
        { code: 'INSUFFICIENT_CREDITS', message: '积分不足' },
        HttpStatus.PAYMENT_REQUIRED,
      ),
    );
    await expect(
      controller.submit(USER as any, { image_url: 'x', preset_keys: ['a'] }),
    ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });
  });

  it('rate-limit 429 bubbles out unchanged', async () => {
    service.submit.mockRejectedValueOnce(
      new HttpException(
        { code: 'AI_RATE_LIMITED' },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
    await expect(
      controller.submit(USER as any, { image_url: 'x', preset_keys: ['a'] }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('empty preset_keys bubbles as 400', async () => {
    service.submit.mockRejectedValueOnce(new BadRequestException('empty'));
    await expect(
      controller.submit(USER as any, { image_url: 'x', preset_keys: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
