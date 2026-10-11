import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ResourceType } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: config.getOrThrow('CLOUDINARY_CLOUD_NAME'),
      api_key: config.getOrThrow('CLOUDINARY_API_KEY'),
      api_secret: config.getOrThrow('CLOUDINARY_API_SECRET'),
    });
  }

  async list(userId: string, state?: string, subject?: string, classLevel?: string) {
    return this.prisma.userResource.findMany({
      where: {
        OR: [{ userId }, { isPublic: true }],
        ...(state && { state }),
        ...(subject && { subject }),
        ...(classLevel && { classLevel }),
      },
      orderBy: [{ isPublic: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async upload(
    userId: string,
    file: Express.Multer.File,
    body: {
      resourceName: string;
      resourceType: ResourceType;
      subject?: string;
      classLevel?: string;
      state?: string;
    },
    isPublic = false,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    this.assertPdf(file);

    let result: any;
    try {
      result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'sabinote/resources',
            resource_type: 'raw', // stores file as-is — no image/video processing
            // Raw assets keep their extension as part of the public_id, so add it
            // explicitly — the stream has no filename for Cloudinary to infer it from.
            public_id: `${randomUUID()}.pdf`,
          },
          (err, res) => (err ? reject(err) : resolve(res)),
        );
        stream.end(file.buffer);
      });
    } catch (err: any) {
      this.logger.error(`Cloudinary upload failed: ${err?.message ?? JSON.stringify(err)}`);
      throw new BadGatewayException(
        `File storage rejected the upload${err?.message ? `: ${err.message}` : ''}`,
      );
    }

    return this.prisma.userResource.create({
      data: {
        userId,
        resourceName: body.resourceName,
        resourceType: body.resourceType,
        subject: body.subject,
        classLevel: body.classLevel,
        state: body.state,
        fileUrl: result.secure_url,
        fileKey: result.public_id,
        fileSizeBytes: file.size,
        mimeType: 'application/pdf',
        isPublic,
        uploadedBy: userId,
      },
    });
  }

  async delete(userId: string, resourceId: string) {
    const resource = await this.prisma.userResource.findUnique({ where: { resourceId } });
    if (!resource) throw new NotFoundException('Resource not found');
    if (resource.userId !== userId) throw new ForbiddenException();

    // Notes keep working after the source file is gone — just unlink them first,
    // otherwise the foreign key blocks the delete.
    await this.prisma.$transaction([
      this.prisma.lessonNote.updateMany({ where: { resourceId }, data: { resourceId: null } }),
      this.prisma.userResource.delete({ where: { resourceId } }),
    ]);

    if (resource.fileKey) {
      try {
        await cloudinary.uploader.destroy(resource.fileKey, { resource_type: 'raw' });
      } catch (err: any) {
        this.logger.warn(`Could not remove ${resource.fileKey} from storage: ${err?.message}`);
      }
    }
  }

  // Validates the PDF magic bytes (%PDF) in the buffer — MIME types are client-supplied
  // and unreliable, magic bytes are not.
  private assertPdf(file: Express.Multer.File) {
    const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
    if (file.buffer.length < 4 || !file.buffer.subarray(0, 4).equals(PDF_MAGIC)) {
      throw new BadRequestException('Uploaded file is not a valid PDF');
    }
  }

  async match(state: string, subject: string, classLevel: string) {
    const resource = await this.prisma.userResource.findFirst({
      where: { state, subject, classLevel, isPublic: true },
      orderBy: { createdAt: 'desc' },
    });
    return { matched: resource ?? null };
  }
}
