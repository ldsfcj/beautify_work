import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 50, { message: '昵称长度需在 1-50 字符之间' })
  nickname?: string;
}
