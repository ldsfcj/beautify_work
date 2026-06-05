import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditPackage } from '../entities/credit-package.entity';

/**
 * Read-only service for the credit package catalogue. The list
 * endpoint is public (no @UseGuards on the controller) so the
 * frontend can render prices before login.
 */
@Injectable()
export class CreditPackageService {
  constructor(
    @InjectRepository(CreditPackage) private readonly packages: Repository<CreditPackage>,
  ) {}

  /** Active packages only, ordered by the admin-defined sort order. */
  async listActive(): Promise<CreditPackage[]> {
    return this.packages.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }
}
