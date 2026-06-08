import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../common/services/prisma.service';

@Injectable()
export class AppShareService {
  constructor(private prisma: PrismaService) {}

  /**
   * 生成分享链接
   */
  async generateShareLink(userId: string, applicationId: string) {
    const app = await this.assertAppOwner(userId, applicationId);

    // 如果已有分享链接则复用
    if (app.shareLink) {
      return {
        shareLink: app.shareLink,
        isPublic: app.isPublic,
      };
    }

    const shareLink = `share-${crypto.randomBytes(16).toString('hex')}`;

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: { shareLink, isPublic: true },
      select: { id: true, shareLink: true, isPublic: true },
    });

    return updated;
  }

  /**
   * 通过分享链接获取应用（公开访问，无需认证）
   */
  async getSharedApp(shareLink: string) {
    const app = await this.prisma.application.findUnique({
      where: { shareLink },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        status: true,
        isPublic: true,
        shareLink: true,
        embedConfig: true,
      },
    });

    if (!app || !app.isPublic) {
      throw new NotFoundException('分享的应用不存在或已关闭分享');
    }

    return app;
  }

  /**
   * 更新分享设置
   */
  async updateShareSettings(
    userId: string,
    applicationId: string,
    settings: {
      isPublic?: boolean;
      embedConfig?: { allowedOrigins?: string[]; theme?: string };
    },
  ) {
    await this.assertAppOwner(userId, applicationId);

    const data: any = {};
    if (settings.isPublic !== undefined) data.isPublic = settings.isPublic;
    if (settings.embedConfig) data.embedConfig = JSON.stringify(settings.embedConfig);

    return this.prisma.application.update({
      where: { id: applicationId },
      data,
      select: {
        id: true,
        shareLink: true,
        isPublic: true,
        embedConfig: true,
      },
    });
  }

  /**
   * 撤销分享链接
   */
  async revokeShareLink(userId: string, applicationId: string) {
    await this.assertAppOwner(userId, applicationId);

    return this.prisma.application.update({
      where: { id: applicationId },
      data: { shareLink: null, isPublic: false, embedConfig: null },
      select: { id: true, shareLink: true, isPublic: true },
    });
  }

  /**
   * 获取嵌入代码
   */
  async getEmbedCode(userId: string, applicationId: string) {
    const app = await this.assertAppOwner(userId, applicationId);

    if (!app.shareLink) {
      throw new ForbiddenException('请先生成分享链接');
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const shareUrl = `${baseUrl}/share/${app.shareLink}`;

    const embedConfig = app.embedConfig ? JSON.parse(app.embedConfig as string) : {};
    const theme = embedConfig.theme || 'light';

    return {
      shareUrl,
      iframeCode: `<iframe src="${shareUrl}" width="100%" height="600" frameborder="0" style="border-radius: 8px;"></iframe>`,
      scriptTag: `<script src="${baseUrl}/embed.js" data-app="${app.shareLink}" data-theme="${theme}"></script>`,
      embedConfig: embedConfig,
    };
  }

  /**
   * 断言应用所有权
   */
  private async assertAppOwner(userId: string, applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) throw new NotFoundException('应用不存在');
    if (app.userId !== userId) throw new ForbiddenException('只有应用所有者才能管理分享设置');

    return app;
  }
}
