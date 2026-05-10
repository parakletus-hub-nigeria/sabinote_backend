import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { ResourcesModule } from '../resources/resources.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [CurriculumModule, ResourcesModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
