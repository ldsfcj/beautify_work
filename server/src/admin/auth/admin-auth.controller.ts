import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';

/**
 * Back-office auth surface. All four endpoints sit under the global
 * `/api` prefix and the `AdminAuthGuard` is applied at the controller
 * level so the public login/refresh routes can stay @Public() while
 * /me and /logout require a valid admin JWT.
 *
 *   POST /api/admin/auth/login     @Public  → 200 {token, refreshToken, user}
 *   POST /api/admin/auth/refresh   @Public  → 200 {token, refreshToken}
 *   POST /api/admin/auth/logout    guarded  → 200 {ok: true}
 *   GET  /api/admin/me             guarded  → 200 {id, username, role, lastLoginAt}
 */
@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminLoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: JwtPayload) {
    return this.auth.logout(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.getProfile(user.id);
  }
}
