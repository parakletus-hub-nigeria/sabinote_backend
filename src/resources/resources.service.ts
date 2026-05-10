import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResourceType } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResourcesService {
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

    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'sabinote/resources',
          resource_type: 'raw',   // stores file as-is — no image/video processing
          format: 'pdf',          // preserves the .pdf extension on the public_id
          use_filename: true,
          unique_filename: true,
        },
        (err, res) => (err ? reject(err) : resolve(res)),
      );
      stream.end(file.buffer);
    });

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

    if (resource.fileKey) {
      await cloudinary.uploader.destroy(resource.fileKey, { resource_type: 'raw' });
    }

    await this.prisma.userResource.delete({ where: { resourceId } });
  }

  // Validates MIME type (Multer) and PDF magic bytes (%PDF) in the buffer.
  // MIME type alone can be spoofed — magic bytes cannot.
  private assertPdf(file: Express.Multer.File) {
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted');
    }
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
