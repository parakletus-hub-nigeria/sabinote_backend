import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Query, UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NotesService } from './notes.service';

@UseGuards(JwtAuthGuard)
@Controller('notes')
export class NotesController {
  constructor(private notesService: NotesService) {}

  @Get()
  async list(
    @CurrentUser() user: { userId: string },
    @Query('page') page = '1', @Query('limit') limit = '20',
    @Query('subject') subject?: string, @Query('classLevel') classLevel?: string,
  ) {
    return { success: true, data: await this.notesService.list(user.userId, +page, +limit, subject, classLevel) };
  }

  @Get('search')
  async search(
    @CurrentUser() user: { userId: string },
    @Query('q') q: string,
    @Query('subject') subject?: string, @Query('classLevel') classLevel?: string,
  ) {
    return { success: true, data: await this.notesService.search(user.userId, q, subject, classLevel) };
  }

  @Get(':noteId')
  async findOne(@CurrentUser() user: { userId: string }, @Param('noteId') noteId: string) {
    return { success: true, data: await this.notesService.findOne(user.userId, noteId) };
  }

  @Patch(':noteId')
  async update(
    @CurrentUser() user: { userId: string },
    @Param('noteId') noteId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    const data = await this.notesService.update(user.userId, noteId, dto);
    return { success: true, data: { savedAt: data.updatedAt } };
  }

  @Delete(':noteId')
  @HttpCode(HttpStatus.OK)
  async delete(@CurrentUser() user: { userId: string }, @Param('noteId') noteId: string) {
    await this.notesService.delete(user.userId, noteId);
    return { success: true, message: 'Note deleted' };
  }
}
