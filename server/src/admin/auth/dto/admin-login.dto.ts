import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for `POST /admin/auth/login`. Length bounds mirror the seed
 * default (`admin` / `admin123`); longer inputs get rejected by the
 * global ValidationPipe before reaching the service.
 */
export class AdminLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
