import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditPackage } from '../../entities/credit-package.entity';
import { AuditService } from '../../audit/audit.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

export interface AdminPackageUpsertDto {
  name: string;
  credits: number;
  priceCents: number;
  bonusCredits?: number;
  validityDays: number;
  isActive?: boolean;
  sortOrder?: number;
}

export interface AdminPackageListResult {
  items: CreditPackage[];
  total: number;
}

/**
 * Back-office credit-package CRUD. The customer-facing `/credit/packages`
 * endpoint is public; this module is the admin counterpart for editing
 * pricing and disabling packages without a code deploy.
 *
 * Same soft-disable pattern as presets: flipping `isActive=false` is
 * preferred over row deletion so historical `orders.package_id` rows
 * still resolve to a name.
 */
@Injectable()
export class AdminPackagesService {
  constructor(
    @InjectRepository(CreditPackage) private readonly repo: Repository<CreditPackage>,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { includeInactive?: boolean } = {}): Promise<AdminPackageListResult> {
    const where = opts.includeInactive ? {} : { isActive: true };
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { sortOrder: 'ASC' },
    });
    return { items, total };
  }

  async upsert(
    dto: AdminPackageUpsertDto,
    operator: JwtPayload,
    id?: string,
  ): Promise<CreditPackage> {
    if (id) {
      const existing = await this.repo.findOne({ where: { id } });
      if (!existing) throw new NotFoundException('套餐不存在');
      const previous = { ...existing };
      Object.assign(existing, dto);
      const saved = await this.repo.save(existing);
      await this.audit.write({
        adminId: operator.id,
        action: 'package.update',
        targetType: 'package',
        targetId: saved.id,
        payload: { name: saved.name, previous, next: dto },
      });
      return saved;
    }
    const created = this.repo.create({
      ...dto,
      bonusCredits: dto.bonusCredits ?? 0,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.repo.save(created);
    await this.audit.write({
      adminId: operator.id,
      action: 'package.create',
      targetType: 'package',
      targetId: saved.id,
      payload: { name: saved.name, dto },
    });
    return saved;
  }

  async remove(id: string, operator: JwtPayload): Promise<{ id: string; isActive: boolean }> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('套餐不存在');
    existing.isActive = false;
    await this.repo.save(existing);
    await this.audit.write({
      adminId: operator.id,
      action: 'package.soft_delete',
      targetType: 'package',
      targetId: existing.id,
      payload: { name: existing.name },
    });
    return { id: existing.id, isActive: false };
  }
}
