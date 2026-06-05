import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CreditPackageService } from './credit-package.service';

/**
 * Public package catalogue. The frontend hits this on the
 * recharge page; no auth needed because there's no user-specific
 * data here.
 */
@Controller('credit/packages')
export class CreditPackageController {
  constructor(private readonly svc: CreditPackageService) {}

  @Public()
  @Get()
  list() {
    return this.svc.listActive();
  }
}
