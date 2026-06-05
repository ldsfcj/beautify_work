import { Body, Controller, Post, Req, HttpCode, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { IsString, Matches, Length } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { SmsService } from './sms.service';

class SendSmsDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;
}

@Controller('auth/sms')
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  /**
   * POST /api/auth/sms/send
   * Public — anyone with a valid Chinese mobile can request a code.
   * The 60s cooldown + 1/min IP rate limit live inside SmsService.
   */
  @Public()
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(@Body() dto: SendSmsDto, @Req() req: Request) {
    const ip = (req.ip ?? req.socket.remoteAddress ?? '0.0.0.0').replace(/^::ffff:/, '');
    const { ttl } = await this.sms.sendCode(dto.phone, ip);
    return { ok: true, ttl };
  }
}
