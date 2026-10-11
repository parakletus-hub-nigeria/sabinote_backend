import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CurriculumModule, NotificationsModule],
  controllers: [GenerationController],
  providers: [GenerationService],
})
export class GenerationModule {}
