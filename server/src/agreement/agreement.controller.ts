import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AgreementService } from './agreement.service';
import { AcceptAgreementDto } from './dto/accept-agreement.dto';
import { GetAgreementDto } from './dto/get-agreement.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Agreement module:
 *   - GET /current   (public — frontend reads on Login page to gate the
 *                     pre-login consent dialog)
 *   - POST /accept   (authenticated — writes the user_agreements row
 *                     keyed to the latest published version)
 */
@Controller('agreement')
export class AgreementController {
  constructor(private readonly agreements: AgreementService) {}

  @Public()
  @Get('current')
  current(@Query() query: GetAgreementDto) {
    return this.agreements.getCurrent(query.type ?? 'user');
  }

  @Post('accept')
  accept(@CurrentUser() u: { id: string }, @Body() dto: AcceptAgreementDto) {
    return this.agreements.accept(u.id, dto.type);
  }
}
