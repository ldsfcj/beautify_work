import { Module } from '@nestjs/common';
import { OssService } from './oss.service';

/**
 * OssModule exports OssService. The generate worker + the
 * download-url endpoint (Task 26) both depend on it.
 */
@Module({
  providers: [OssService],
  exports: [OssService],
})
export class OssModule {}
