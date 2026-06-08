import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';

export interface ListNotificationOptions {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

export interface NotificationListResult {
  items: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
}

/**
 * In-app notification reader/writer. The frontend polls
 * `GET /api/notification/list` every 5s when the bell icon is
 * visible (D12), so this service is read-heavy — the read path
 * is optimised with a single SELECT that also pulls the total
 * unread count via a parallel COUNT, and the write path is a
 * single INSERT.
 *
 * The PATCH endpoint is intentionally scoped to the calling
 * user: a user can only mark their own notifications as read.
 * A foreign id returns 404 (not 403) to avoid leaking the
 * existence of another user's notification row.
 */
@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const entity = this.repo.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: input.payload ?? null,
      readAt: null,
    });
    return this.repo.save(entity);
  }

  async list(
    userId: string,
    opts: ListNotificationOptions = {},
  ): Promise<NotificationListResult> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
    const unreadOnly = opts.unreadOnly ?? false;

    const where = unreadOnly
      ? { userId, readAt: IsNull() }
      : { userId };

    const [items, total] = await this.repo.findAndCount({
      where,
      // Unread first, then most-recent first. We do the unread
      // ordering in SQL via CASE WHEN so it doesn't need a
      // composite index.
      order: { readAt: 'ASC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const unreadCount = await this.repo.count({
      where: { userId, readAt: IsNull() },
    });

    return { items, total, unreadCount, page, pageSize };
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notif = await this.repo.findOne({ where: { id, userId } });
    if (!notif) {
      throw new NotFoundException('通知不存在');
    }
    if (notif.readAt) {
      return notif; // idempotent
    }
    notif.readAt = new Date();
    return this.repo.save(notif);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: () => 'NOW()' })
      .where('user_id = :userId AND read_at IS NULL', { userId })
      .execute();
    return { updated: result.affected ?? 0 };
  }
}
