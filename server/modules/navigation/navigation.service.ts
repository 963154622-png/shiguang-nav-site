import { Injectable, Logger, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { applyPatch, Collection, CollectionPatch, NavCollectionData, pack, unpack, validCollection } from './collection';

type RecordFields = Record<string, unknown>;
type BaseRecord = { fields: RecordFields };
type ApiResponse = {
  code?: number;
  tenant_access_token?: string;
  expire?: number;
  data?: { record?: BaseRecord & { record_id?: string } };
};

const api = 'https://open.feishu.cn/open-apis';
const fields = { revision: '收藏版本', updatedAt: '更新时间', snapshot: '导航数据' };
const chunkManifestPrefix = 'navchunks:1:';
const chunkSize = 72_000;

function plainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map(part => typeof part?.text === 'string' ? part.text : '').join('');
}

@Injectable()
export class NavigationService {
  private readonly logger = new Logger(NavigationService.name);
  private token: { value: string; validUntil: number } | null = null;
  private writes = Promise.resolve();

  private settings() {
    const appId = process.env.FEISHU_APP_ID;
    const secret = process.env.FEISHU_APP_SECRET;
    const base = process.env.FEISHU_BASE_TOKEN;
    const table = process.env.FEISHU_TABLE_ID;
    const record = process.env.FEISHU_RECORD_ID;
    if (!appId || !secret || !base || !table || !record || ![base, table, record].every(id => /^[a-zA-Z0-9]+$/.test(id))) {
      throw new ServiceUnavailableException('飞书云端收藏还未配置。');
    }
    const tablePath = `/bitable/v1/apps/${base}/tables/${table}`;
    return { appId, secret, tablePath, recordPath: `${tablePath}/records/${record}` };
  }

  private async feishu(stage: string, path: string, method: 'GET' | 'POST' | 'PUT', token?: string, body?: unknown): Promise<ApiResponse> {
    let response: Response | undefined;
    let data: ApiResponse | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch(api + path, {
          method,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            ...(token && { authorization: `Bearer ${token}` }),
          },
          body: body == null ? undefined : JSON.stringify(body),
          redirect: 'manual',
          signal: AbortSignal.timeout(4500),
        });
        data = await response.json() as ApiResponse;
      } catch {
        if (attempt === 2) {
          this.logger.warn(`Feishu ${stage} network error ${response?.status ?? 0}`);
          throw new ServiceUnavailableException('暂时无法连接飞书。');
        }
        await new Promise(resolve => setTimeout(resolve, 400 * (2 ** attempt)));
        continue;
      }
      const retryable = [429, 500, 502, 503, 504].includes(response.status)
        || [1254290, 1254291, 1254607].includes(data?.code ?? -1);
      if (response.ok && data?.code === 0) return data;
      if (!retryable || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 400 * (2 ** attempt)));
    }
    this.logger.warn(`Feishu ${stage} rejected: HTTP ${response?.status ?? 0}, code ${data?.code ?? 0}`);
    if (data?.code === 1254130) throw new PayloadTooLargeException('飞书单条收藏容量不足。');
    throw new ServiceUnavailableException('飞书暂时无法读写收藏。');
  }

  private async accessToken() {
    if (this.token && this.token.validUntil > Date.now()) return this.token.value;
    const { appId, secret } = this.settings();
    const response = await this.feishu('authentication', '/auth/v3/tenant_access_token/internal', 'POST', undefined, {
      app_id: appId,
      app_secret: secret,
    });
    if (!response.tenant_access_token) throw new ServiceUnavailableException('飞书应用授权暂不可用。');
    const duration = Math.max(0, (response.expire ?? 0) - 60);
    this.token = { value: response.tenant_access_token, validUntil: Date.now() + duration * 1000 };
    return this.token.value;
  }

  private readRecord(record: BaseRecord | undefined, snapshot?: string): Collection {
    const value = record?.fields[fields.revision];
    const revision = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    const data = snapshot ?? plainText(record?.fields[fields.snapshot]);
    const updatedAt = plainText(record?.fields[fields.updatedAt]);
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1 || !updatedAt) {
      throw new ServiceUnavailableException('飞书收藏版本暂不可用。');
    }
    try {
      return { ...unpack(data), revision, updatedAt };
    } catch {
      throw new ServiceUnavailableException('飞书收藏数据暂不可用。');
    }
  }

  async read() {
    const { recordPath } = this.settings();
    const token = await this.accessToken();
    const result = await this.feishu('read', recordPath, 'GET', token);
    const record = result.data?.record;
    const stored = plainText(record?.fields[fields.snapshot]);
    if (!stored.startsWith(chunkManifestPrefix)) return this.readRecord(record, stored);
    const ids = stored.slice(chunkManifestPrefix.length).split(',').filter(id => /^[a-zA-Z0-9]+$/.test(id));
    if (!ids.length || ids.length > 20) throw new ServiceUnavailableException('飞书收藏分片暂不可用。');
    const parts: string[] = [];
    const { tablePath } = this.settings();
    for (const id of ids) {
      const chunk = await this.feishu('read chunk', `${tablePath}/records/${id}`, 'GET', token);
      parts.push(plainText(chunk.data?.record?.fields[fields.snapshot]));
    }
    return this.readRecord(record, parts.join(''));
  }

  save(revision: number, collection: NavCollectionData, snapshot: string) {
    const operation = this.writes.then(() => this.update(revision, collection, snapshot));
    this.writes = operation.then(() => undefined, () => undefined);
    return operation;
  }

  savePatch(revision: number, patch: CollectionPatch) {
    const operation = this.writes.then(async () => {
      const previous = await this.read();
      if (previous.revision !== revision) return { conflict: true, collection: previous };
      const { revision: _revision, updatedAt: _updatedAt, ...baseData } = previous;
      const collection = applyPatch(baseData, patch);
      if (!validCollection(collection)) throw new ServiceUnavailableException('收藏格式不符合要求。');
      const snapshot = pack(collection);
      if (!snapshot) throw new ServiceUnavailableException('收藏内容过大。');
      return this.updateWithPrevious(previous, collection, snapshot);
    });
    this.writes = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async update(revision: number, collection: NavCollectionData, snapshot: string) {
    const previous = await this.read();
    if (previous.revision !== revision) return { conflict: true, collection: previous };
    return this.updateWithPrevious(previous, collection, snapshot);
  }

  private async updateWithPrevious(previous: Collection, collection: NavCollectionData, snapshot: string) {
    const next = previous.revision + 1;
    const updatedAt = new Date().toISOString();
    const { recordPath, tablePath } = this.settings();
    let actual: Collection;
    try {
      const token = await this.accessToken();
      let storedSnapshot = snapshot;
      if (snapshot.length > chunkSize) {
        const current = await this.feishu('read manifest', recordPath, 'GET', token);
        const currentValue = plainText(current.data?.record?.fields[fields.snapshot]);
        const reusable = currentValue.startsWith(chunkManifestPrefix)
          ? currentValue.slice(chunkManifestPrefix.length).split(',').filter(id => /^[a-zA-Z0-9]+$/.test(id)) : [];
        const parts = Array.from({ length: Math.ceil(snapshot.length / chunkSize) }, (_, index) =>
          snapshot.slice(index * chunkSize, (index + 1) * chunkSize));
        const ids: string[] = [];
        for (let index = 0; index < parts.length; index += 1) {
          const existing = reusable[index];
          const path = existing ? `${tablePath}/records/${existing}` : `${tablePath}/records`;
          const result = await this.feishu(`write chunk ${index + 1}`, path, existing ? 'PUT' : 'POST', token, {
            fields: { [fields.snapshot]: parts[index] },
          });
          const id = existing || result.data?.record?.record_id;
          if (!id || !/^[a-zA-Z0-9]+$/.test(id)) throw new ServiceUnavailableException('飞书收藏分片写入失败。');
          ids.push(id);
          if (index + 1 < parts.length) await new Promise(resolve => setTimeout(resolve, 250));
        }
        storedSnapshot = chunkManifestPrefix + ids.join(',');
      }
      const result = await this.feishu('write', recordPath, 'PUT', await this.accessToken(), {
        fields: {
          [fields.revision]: next,
          [fields.updatedAt]: updatedAt,
          [fields.snapshot]: storedSnapshot,
        },
      });
      actual = storedSnapshot === snapshot
        ? this.readRecord(result.data?.record)
        : await this.read();
    } catch (error) {
      // A timed out request or a competing device may already have committed this revision.
      actual = await this.read();
      if (actual.revision === previous.revision) throw error;
    }
    return {
      conflict: actual.revision !== next || JSON.stringify({ ...actual, revision: undefined, updatedAt: undefined }) !== JSON.stringify(collection),
      collection: actual,
    };
  }
}
