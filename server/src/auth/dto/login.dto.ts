import { IsString, Matches, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;

  @IsString()
  @Length(6, 6, { message: '验证码必须为 6 位' })
  code!: string;
}
