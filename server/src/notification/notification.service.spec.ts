import { NotFoundException } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { NotificationService } from './notification.service';

/**
 * Behaviour the runbook (Task 24) calls out + a few edge cases
 * that matter for the dashboard polling loop:
 *   1. `list` returns items newest-first, unread first.
 *   2. `unreadOnly=true` filters the list but `unreadCount` is
 *      still the global count (the bell icon always shows the
 *      total unread regardless of which filter is active).
 *   3. `markRead` is scoped to the caller — a foreign id throws
 *      404, not 403, to avoid leaking existence of other users'
 *      notifications.
 *   4. `markRead` is idempotent: re-marking a read notification
 *      returns it unchanged.
 *   5. `markAllRead` updates every unread row in one query.
 */
describe('NotificationService', () => {
  let service: NotificationService;
  let repo: jest.Mocked<
    Pick<
      Repository<Notification>,
      'create' | 'save' | 'findAndCount' | 'findOne' | 'count'
    >
  > & {
    createQueryBuilder: jest.Mock;
  };
  const USER = 'user-1';

  beforeEach(() => {
    repo = {
      create: jest.fn((x) => x as Notification),
      save: jest.fn(async (x: any) => ({ id: 'n-1', readAt: null, ...x })),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;
    service = new NotificationService(repo as unknown as Repository<Notification>);
  });

  it('create persists with readAt=null', async () => {
    const r = await service.create({
      userId: USER,
      type: 'generation_done',
      title: '生成完成',
      body: '查看您的 AI 预览图',
      payload: { generationId: 'g1' },
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        type: 'generation_done',
        readAt: null,
      }),
    );
    expect(r).toMatchObject({ id: 'n-1', readAt: null });
  });

  it('list returns items + total + unreadCount + paging metadata', async () => {
    const items: Notification[] = [
      { id: 'n1', userId: USER, type: 'a', title: 't', body: 'b', payload: null, readAt: null, createdAt: new Date(), user: null as any },
    ];
    repo.findAndCount.mockResolvedValue([items, 1]);
    repo.count.mockResolvedValue(3);

    const r = await service.list(USER, { page: 1, pageSize: 20 });

    expect(r.items).toBe(items);
    expect(r.total).toBe(1);
    expect(r.unreadCount).toBe(3);
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(20);
    expect(repo.findAndCount).toHaveBeenCalledWith({
      where: { userId: USER },
      order: { readAt: 'ASC', createdAt: 'DESC' },
      skip: 0,
      take: 20,
    });
  });

  it('unreadOnly=true scopes the list query but not the unreadCount', async () => {
    repo.findAndCount.mockResolvedValue([[], 0]);
    repo.count.mockResolvedValue(5);

    const r = await service.list(USER, { unreadOnly: true });

    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER, readAt: IsNull() },
      }),
    );
    expect(repo.count).toHaveBeenCalledWith({
      where: { userId: USER, readAt: IsNull() },
    });
    expect(r.unreadCount).toBe(5);
  });

  it('markRead updates readAt and returns the entity', async () => {
    const notif: Notification = {
      id: 'n-1',
      userId: USER,
      type: 'a',
      title: 't',
      body: 'b',
      payload: null,
      readAt: null,
      createdAt: new Date(),
      user: null as any,
    };
    repo.findOne.mockResolvedValue(notif);
    repo.save.mockImplementation(async (n: any) => n);

    const r = await service.markRead(USER, 'n-1');

    expect(r.readAt).toBeInstanceOf(Date);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n-1' }),
    );
  });

  it('markRead is idempotent for an already-read notification', async () => {
    const readAt = new Date('2026-06-01');
    const notif: Notification = {
      id: 'n-1',
      userId: USER,
      type: 'a',
      title: 't',
      body: 'b',
      payload: null,
      readAt,
      createdAt: new Date(),
      user: null as any,
    };
    repo.findOne.mockResolvedValue(notif);

    const r = await service.markRead(USER, 'n-1');

    expect(r).toBe(notif);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('markRead throws 404 for a foreign id (no existence leak)', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.markRead(USER, 'n-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('markAllRead runs a single UPDATE returning the affected count', async () => {
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 7 }),
    };
    repo.createQueryBuilder.mockReturnValue(qb);

    const r = await service.markAllRead(USER);

    expect(r).toEqual({ updated: 7 });
    expect(qb.update).toHaveBeenCalled();
    expect(qb.where).toHaveBeenCalledWith(
      'user_id = :userId AND read_at IS NULL',
      { userId: USER },
    );
  });
});
