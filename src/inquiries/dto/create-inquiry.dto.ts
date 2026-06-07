import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateInquiryDto {
  @ApiProperty({ description: '회신받을 이메일', example: 'user@example.com' })
  @IsEmail()
  @Length(1, 255)
  email!: string;

  @ApiProperty({ description: '문의 카테고리 ID' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 100,
    description: '제목',
    example: '캔버스가 멈춰요',
  })
  @IsString()
  @Length(1, 100)
  title!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 2000,
    description: '내용',
    example: '게임 도중 그림이 동기화되지 않습니다.',
  })
  @IsString()
  @Length(1, 2000)
  content!: string;

  @ApiProperty({
    description: '개인정보 수집·이용 동의 (필수, true여야 함)',
    example: true,
  })
  @IsBoolean()
  @Equals(true, { message: '개인정보 수집·이용에 동의해야 합니다' })
  privacyConsent!: boolean;
}
