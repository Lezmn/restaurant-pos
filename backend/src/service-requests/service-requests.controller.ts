import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, ServiceRequestStatus, ServiceRequestType } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { FindServiceRequestsQueryDto } from './dto/find-service-requests-query.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { ServiceRequestsService } from './service-requests.service';

@ApiTags('service-requests')
@ApiBearerAuth()
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(
    private readonly serviceRequestsService: ServiceRequestsService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'สร้างคำขอจากโต๊ะ เช่น เรียกพนักงาน' })
  create(@Body() dto: CreateServiceRequestDto) {
    return this.serviceRequestsService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ดูคำขอจากโต๊ะทั้งหมด (filter ได้)' })
  @ApiQuery({ name: 'status', required: false, enum: ServiceRequestStatus })
  @ApiQuery({ name: 'type', required: false, enum: ServiceRequestType })
  @ApiQuery({ name: 'tableId', required: false })
  @ApiQuery({ name: 'tableSessionId', required: false })
  findAll(@Query() query: FindServiceRequestsQueryDto) {
    return this.serviceRequestsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ดูคำขอจากโต๊ะตาม id' })
  findOne(@Param('id') id: string) {
    return this.serviceRequestsService.findOne(id);
  }

  @Patch(':id/payment-method')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'แก้ไขวิธีจ่ายเงินของคำขอเช็คบิล (เฉพาะ type=CHECKOUT)' })
  updatePaymentMethod(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.serviceRequestsService.updatePaymentMethod(
      id,
      dto.paymentMethod,
    );
  }

  @Patch(':id/resolve')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'กดว่าจัดการคำขอนี้เสร็จแล้ว' })
  resolve(@Param('id') id: string) {
    return this.serviceRequestsService.resolve(id);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ยกเลิกคำขอนี้' })
  cancel(@Param('id') id: string) {
    return this.serviceRequestsService.cancel(id);
  }
}
