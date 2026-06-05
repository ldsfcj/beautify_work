import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from './common/decorators/public.decorator';

/**
 * App-level endpoints (health, version, etc).
 * Health endpoint is marked @Public() so it is reachable without auth.
 */
@Controller()
export class AppController {
  constructor(private readonly health: HealthCheckService) {}

  @Public()
  @Get('health')
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
