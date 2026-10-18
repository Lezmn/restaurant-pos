import { PartialType } from '@nestjs/swagger';
import { CreateMenuOptionDto } from './create-menu-option.dto';

export class UpdateMenuOptionDto extends PartialType(CreateMenuOptionDto) {}
