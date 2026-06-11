import { Module } from '@nestjs/common';
import { OssController } from './oss.controller';
import { OssService } from './oss.service';

/**
 * OssModule exports OssService and exposes the presign + dev-upload
 * HTTP surface. The generate worker + the download-url endpoint
 * (Task 26) both depend on OssService.
 */
@Module({
  controllers: [OssController],
  providers: [OssService],
  exports: [OssService],
})
export class OssModule {}
