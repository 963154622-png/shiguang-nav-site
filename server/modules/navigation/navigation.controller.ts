import { createHash, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Put, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { pack, validModules } from './collection';
import { NavigationService } from './navigation.service';

@Controller('api/collection')
export class NavigationController {
  constructor(private readonly navigation: NavigationService) {}

  private authorize(request: Request, response: Response) {
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
  async save(@Req() request: Request, @Body() input: { revision?: unknown; modules?: unknown }, @Res() response: Response) {
    this.authorize(request, response);
    const revision = input?.revision;
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1 ||
        revision >= Number.MAX_SAFE_INTEGER || !validModules(input?.modules)) {
      return response.status(400).json({ error: 'invalid_collection' });
    }
    const snapshot = pack(input.modules);
    if (!snapshot) return response.status(413).json({ error: 'collection_too_large' });
    const result = await this.navigation.save(revision, input.modules, snapshot);
    const collection = result.collection;
    return result.conflict
      ? response.status(409).json(collection)
      : response.json({ revision: collection.revision, updatedAt: collection.updatedAt });
  }
}
