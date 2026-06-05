import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';

/**
 * Order endpoints. All routes require a valid user JWT (the global
 * `JwtAuthGuard` short-circuits on `@Public()` and the controller
 * declares its own `@UseGuards` so it shows up clearly in the route
 * table).
 */
@Controller('order')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly svc: OrderService) {}

  @Post('create')
  create(@CurrentUser() u: { id: string }, @Body() dto: CreateOrderDto) {
    return this.svc.create(u.id, dto.packageId, dto.method);
  }

  @Get('list')
  list(
    @CurrentUser() u: { id: string },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(10), ParseIntPipe) size: number,
  ) {
    return this.svc.list(u.id, page, size);
  }

  @Get(':no')
  detail(@CurrentUser() u: { id: string }, @Param('no') orderNo: string) {
    return this.svc.detail(u.id, orderNo);
  }
}
