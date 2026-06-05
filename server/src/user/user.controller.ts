import { Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('me')
  me(@CurrentUser() u: { id: string }) {
    return this.users.getMe(u.id);
  }

  @Patch('me')
  update(@CurrentUser() u: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(u.id, dto);
  }

  @Delete('me')
  cancel(@CurrentUser() u: { id: string }) {
    return this.users.cancel(u.id);
  }
}
