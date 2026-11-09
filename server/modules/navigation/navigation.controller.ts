import { Body, Controller, Get, Put, Req, Res, UnauthorizedException } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request, Response } from 'express';
import { pack, validModules } from './collection';
import { NavigationService } from './navigation.service';

@Controller('api/collection')
@NeedLogin()
export class NavigationController {
  constructor(private readonly navigation: NavigationService) {}

  private authorize(request: Request, response: Response) {
    const owner = process.env.NAV_OWNER_ID;
    if (!owner || request.userContext?.userId !== owner) throw new UnauthorizedException();
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
