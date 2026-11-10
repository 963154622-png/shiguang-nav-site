import { createHash, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Post, Put, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { applyPatch, CollectionPatch, pack, validCollection } from './collection';
import { NavigationService } from './navigation.service';

@Controller('api/collection')
export class NavigationController {
  constructor(private readonly navigation: NavigationService) {}

  private authorize(request: Request, response: Response) {
    if (process.env.GITHUB_TOKEN) {
      response.set('cache-control', 'private, no-store');
      return;
    }
    const expected = process.env.NAV_ACCESS_KEY;
    const supplied = request.header('x-shiguang-access');
    if (!expected || !supplied) throw new UnauthorizedException();
    const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
    const suppliedHash = createHash('sha256').update(supplied, 'utf8').digest();
    if (!timingSafeEqual(expectedHash, suppliedHash)) throw new UnauthorizedException();
    response.set('cache-control', 'private, no-store');
  }

  @Get()
  async read(@Req() request: Request, @Res() response: Response) {
    this.authorize(request, response);
    return response.json(await this.navigation.read());
  }

  @Put()
  async save(@Req() request: Request, @Body() input: { revision?: unknown; patch?: unknown; modules?: unknown; brandName?: unknown; brandIcon?: unknown; brandImage?: unknown; title?: unknown; subtitle?: unknown; wallpaper?: unknown; wallpaperPreset?: unknown; layout?: unknown }, @Res() response: Response) {
    this.authorize(request, response);
    const revision = input?.revision;
    if (input?.patch && typeof input.patch === 'object') {
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1 || revision >= Number.MAX_SAFE_INTEGER) {
        return response.status(400).json({ error: 'invalid_collection' });
      }
      const result = await this.navigation.savePatch(revision, input.patch as CollectionPatch);
      return result.conflict ? response.status(409).json(result.collection) : response.json(result.collection);
    }
    const data = {
      modules: input?.modules,
      brandName: input?.brandName,
      brandIcon: input?.brandIcon,
      brandImage: input?.brandImage,
      title: input?.title,
      subtitle: input?.subtitle,
      wallpaper: input?.wallpaper,
      wallpaperPreset: input?.wallpaperPreset,
      layout: input?.layout,
    };
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1 ||
        revision >= Number.MAX_SAFE_INTEGER || !validCollection(data)) {
      return response.status(400).json({ error: 'invalid_collection' });
    }
    const snapshot = pack(data);
    if (!snapshot) return response.status(413).json({ error: 'collection_too_large' });
    const result = await this.navigation.save(revision, data, snapshot);
    const collection = result.collection;
    return result.conflict
      ? response.status(409).json(collection)
      : response.json(collection);
  }

  @Post('feishu-backup')
  async backup(@Req() request: Request, @Body() input: { modules?: unknown; brandName?: unknown; brandIcon?: unknown; brandImage?: unknown; title?: unknown; subtitle?: unknown; wallpaper?: unknown; wallpaperPreset?: unknown; layout?: unknown }, @Res() response: Response) {
    this.authorize(request, response);
    const data = { modules: input.modules, brandName: input.brandName, brandIcon: input.brandIcon, brandImage: input.brandImage, title: input.title, subtitle: input.subtitle, wallpaper: input.wallpaper, wallpaperPreset: input.wallpaperPreset, layout: input.layout };
    if (!validCollection(data)) return response.status(400).json({ error: 'invalid_collection' });
    return response.json(await this.navigation.backupToFeishu(data));
  }
}
