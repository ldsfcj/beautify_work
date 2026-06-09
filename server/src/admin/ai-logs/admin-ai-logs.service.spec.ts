import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminAiLogsService } from './admin-ai-logs.service';
import { AiCallLog } from '../../entities/ai-call-log.entity';

describe('AdminAiLogsService', () => {
  let service: AdminAiLogsService;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: {
    orderBy: jest.Mock;
    andWhere: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };

  beforeEach(async () => {
    qb = {
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };
    repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAiLogsService,
        { provide: getRepositoryToken(AiCallLog), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(AdminAiLogsService);
  });

  it('clamps pageSize to 1..200', async () => {
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    await service.list({ pageSize: 9999 });
    expect(qb.take).toHaveBeenCalledWith(200);
  });

  it('applies model + date filters', async () => {
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    await service.list({ model: 'mock-v1', fromDate: '2026-01-01', toDate: '2026-12-31' });
    expect(qb.andWhere).toHaveBeenCalledTimes(3);
  });
});
