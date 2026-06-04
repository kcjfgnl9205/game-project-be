import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateWordPairDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 30,
    description: '일반인 단어',
    example: '사자',
  })
  @IsString()
  @Length(1, 30)
  civilianWord!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 30,
    description: '마피아 단어',
    example: '호랑이',
  })
  @IsString()
  @Length(1, 30)
  mafiaWord!: string;
}
