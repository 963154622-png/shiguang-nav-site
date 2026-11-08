# 多维表格评论组件（Record comments）

需要记录评论、新增/回复、编辑/删除、@人员、表情回应或云文档引用时，先读项目内 `client/src/components/business-ui/record-comments/README.md` 与 `comment-panel.contract.ts`，优先复用 `CommentsProvider + CommentList + CommentComposer`，不要重新实现编辑器、弹层或乐观更新。先检查当前目录入口：旧模板只有 `CommentPanel` 时继续使用兼容入口，不假设新导出已存在；升级整个组件后再切换。此组件随 **nestjs-react-fullstack** 模板分发；旧应用若没有该目录，需要先升级/同步组件及依赖，不能只复制入口文件。本指引不适用于缺少该资产的其他技术栈。

## Agent 读取顺序

先读组件 README 的最小接入和 `comment-panel.contract.ts`；只有自定义人员/文档来源时再按需读 `types.ts`。应用只从目录入口导入，业务请求、缓存和权限判断放在宿主 hook。`internal/` 已按模型/乐观更新、展示/输入、编辑器/提及、扩展能力分组，普通接入不读取或修改它。样式由组件入口集中加载，不逐个复制 CSS。文档适配器需要 URL 工具时从同一入口（纯数据适配器可从 `app-source.ts`）导入 `safeUrl/documentRefFromUrl`。

## 接入边界

- 从 `@/components/business-ui/record-comments` 导入组合式入口和公共类型（旧接入保留 `CommentPanel`）；所有内部文件、CSS、`assets/reaction-sprite.png` 必须保留。Tiptap 依赖及 `@floating-ui/dom` 已由模板配置，不混装 Tiptap 大版本。
- Provider 不产生 DOM，共享回复目标、人员解析和乐观层；CommentList 管理展示、菜单、行内编辑、读取状态和分页触发，CommentComposer 管理输入、提及与发送。标题、外层滚动和输入框位置由宿主组合；**评论 CRUD、插件实例、用户身份、读缓存、分页游标、表情及文档请求全部由页面/API hook 提供**。不要把插件凭据、实例 ID、表格配置或应用 ID 写进组件内部。
- `createAppCommentSource(scopeKey)` 是可选的模板人员目录适配器，只识别妙搭人员 ID；其他目录实现 `CommentDataSource`，不要把飞书 ID 冒充妙搭 ID。默认人员目录不提供空查询推荐；裸 @ 没有推荐结果时不弹“列表为空”菜单，输入姓名后正常搜索。宿主可提供 `recommend`，例如从当前讨论参与者解析推荐列表。
- `scopeKey` 必须覆盖应用/租户/登录身份/插件实例/数据源与权限上下文，以上任一变化都应更换；`recordID` 切换会重建编辑会话。`mentionSource` 用 `useMemo` 稳定，避免每次渲染重建搜索和缓存。

## 真实接口先核对

按本 skill 的插件元数据流程拿到当前实例真实 Action schema。以下是已联调版本的映射，**实际 actionKey、字段和响应层级始终以当前元数据为准**，缺能力则隐藏该功能，不伪造成功、不回退 mock。

| 宿主能力 | 已联调 Action / 输入约定 |
| --- | --- |
| 评论读取 | `listRecordComments`，传 `recordID`，需要回应时传 `needReaction:true`；按 `hasMore/pageToken` 加载下一页 |
| 新增/回复 | `addRecordComment`；新评论不传 `commentID`，回复保留原 `commentID`，返回真实 `commentID/replyID` |
| 编辑 | `updateRecordComment`；传 `recordID/commentID/replyID/content`，回读并传入回复级 `updateTime` |
| 删除 | `deleteRecordComment`；消息菜单必须传选中消息的 `replyID`（含首条），只删该消息；第二条顺位成为正文，其余回复保留。省略 replyID 仅兼容显式整串删除，按 `commentDeleted` 更新缓存 |
| 回应读取/写入 | `getRecordCommentReactions` / `updateRecordCommentReaction`；写入用显式 `add/delete`，组件回调的 `remove` 需映射成插件的 `delete` |
| 云文档推荐/搜索/解析 | `getCommentDocuments`；外部实现 `CommentDocumentSource`，通过 `commentDocuments(source)` 注册；旧 withDocumentSource + enableDocuments 保留兼容 |

每条 `comments[]` 是讨论，`replies[0]` 是正文，其余 replies 是同一讨论下的消息；不要把回复拆成独立 comment。`commentID/replyID` 始终是字符串。`createTime/updateTime` 是 Unix **秒**，排序取创建时间，展示取 `updateTime ?? createTime`；缺更新时间不能伪造“编辑过”。`mention.userID` 缺失时保留缺失引用，不猜人。

## 受控组件的宿主实现

1. 宿主发起首屏读取，维护 `comments/loading/error`，传 `onRetry`。分页可全量拉取后不给 `pagination`，也可传 `{hasMore, loading, error, onLoadMore}`；组件接近底部会自动调用，宿主用自己的游标追加数据，追加后再 resolve，失败必须 reject。游标不前进时终止并报错。
2. 宿主提供 `onAddComment/onUpdateComment/onDeleteComment`。写成功后立即返回真实 ID/删除结果，再单独启动回读；**不能把后续回读失败当成写失败**，否则组件重试可能重复发表。不需要在宿主再插一份临时评论，也不必等待回读才关闭编辑器。
3. 编辑/删除必须显式传 `getReplyPermissions`，未提供就隐藏。前端作者判断只控制菜单，服务端仍检查当前用户权限；不能用 owner 身份补足。点击消息菜单“删除”直接发起请求，不追加二次确认；删除首条也只删它本身，不能扩大到其他人的回复；只有最后一条消失时移除空讨论。
4. 普通 `Error` 仅用于确认未应用的失败；超时/连接中断等可能已提交时，抛 `Object.assign(new Error(message), {outcome:'unknown'})`，组件保留内容并阻止盲目重试，宿主先刷新核对。只有请求尚未发送等已确认未写入的断网失败才标记 `not-applied`。
5. 宿主缓存要保护读取顺序，取消/忽略旧请求，切换身份时隔离缓存；组件在匹配快照接管后无法判断一个没有版本号的旧数组。不要通过延迟 toast、二次 loading 或本地时间 Map 掩盖回读错误。

最小受控接入（`props` 来自应用自己的真实 API hook，不是组件内部请求接口）：

```tsx
import { useMemo } from 'react';
import {
  CommentsProvider, CommentList, CommentComposer, createAppCommentSource,
  type CommentsProviderProps,
} from '@/components/business-ui/record-comments';

type Props = Omit<CommentsProviderProps, 'mentionSource' | 'children'>;

export function RecordComments(props: Props) {
  const mentionSource = useMemo(
    () => createAppCommentSource(props.scopeKey), [props.scopeKey],
  );
  return (
    <CommentsProvider {...props} mentionSource={mentionSource}>
      <section className="flex h-full min-h-0 flex-col">
        <h2 className="px-4 py-3">讨论</h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CommentList />
        </div>
        <div className="p-4"><CommentComposer /></div>
      </section>
    </CommentsProvider>
  );
}
```

只读展示可只挂 `CommentList`；只新增可只挂 `CommentComposer`，仍需要 Provider 的 `comments={[]}` 和真实写入回调。同一 Provider 只挂一个主输入框，列表的编辑器由组件管理。两个视图各自支持 div 属性、className/style 和 DOM ref，无需宿主手工添加内部 CSS 类。列表和输入框可以跨宿主布局/React Portal，必须位于同一 React Provider 下才能联动。不要各包一个 Provider，或在宿主再维护 replyTarget/乐观消息队列。

`CommentPanel` 保留原有完整布局及 `CommentPanelProps`，旧项目可保持原调用；新页面用组合入口决定标题、滚动、高度和输入框间距。CSS 文件和默认外观继续保留，不为拆分重写样式、复制编辑器或细拆头像/按钮。

真实调用继续使用 `capabilityClient.load(instanceID).call(actionKey, input)`，不要在组件里调用 CLI 或直接手写 OAuth；`call()` 的结果已由 SDK 解包，按实际 schema 使用，不要重复套 `data.output`。写入回调须返回合同中的真实结果，不能返回 `void`。

## 扩展开启与外部接口

扩展采用 **Provider 级注册 + 宿主适配器注入**。注册决定组件能展示哪些能力；适配器负责真实接口、缓存和权限。组件不会因为注册而自动安装插件、上传文件或获得新权限。

### 开启步骤

1. 检查目录入口是否导出 `commentReactions/commentDocuments/commentImages`，读取公共类型。旧模板只有 feature props 时继续旧方式，升级整个目录后再切换。
2. 核对当前插件实例元数据及当前用户身份下的能力，先在应用 API hook 中实现对应适配器。读取失败不能返回空数组冒充成功；没有真实能力就不注册。
3. 在当前记录的 Provider 传入稳定的 extensions。mentionSource 仍是人员来源，文档来源由扩展自动合并。下面的 base/reactions/documents/images 都由宿主提供，不是组件内置请求或现成 API 路由。

```tsx
import { useMemo } from 'react';
import {
  CommentsProvider, CommentList, CommentComposer,
  commentReactions, commentDocuments, commentImages,
  type CommentsProviderProps, type CommentExtension,
  type CommentReactionFeature, type CommentDocumentSource, type CommentImageFeature,
} from '@/components/business-ui/record-comments';

type CoreProps = Omit<CommentsProviderProps,
  'children' | 'extensions' | 'reactions' | 'images' | 'enableDocuments'>;

type Props = {
  base: CoreProps;
  reactions?: CommentReactionFeature;
  documents?: CommentDocumentSource;
  images?: CommentImageFeature;
};

export function RecordComments({ base, reactions, documents, images }: Props) {
  const extensions = useMemo(() => {
    const registered: CommentExtension[] = [];
    if (reactions) registered.push(commentReactions(reactions));
    if (documents) registered.push(commentDocuments(documents));
    if (images) registered.push(commentImages(images));
    return registered;
  }, [reactions, documents, images]);

  return (
    <CommentsProvider {...base} extensions={extensions}>
      <CommentList />
      <CommentComposer />
    </CommentsProvider>
  );
}
```

当前多维表格接入只按真实能力传 reactions/documents，**不传 images**。未来宿主另有完整图片接口时再传入。标题、间距和滚动区域仍由页面组合。

| 注册方式 | 只读展示 | 写入入口的开启条件 |
| --- | --- | --- |
| 不注册，且不传对应旧 feature props | 不显示该扩展 | 不显示 |
| `commentReactions(feature)` | getReactions 提供缓存中的回应 | 提供 onChange，且 canChange 允许当前目标 |
| `commentDocuments(source)` | resolve 解析已有引用的可读元数据 | 自动开启文档候选；发送/编辑仍需要 Provider 的文字写回调 |
| `commentImages(feature)` | getImages 提供已持久化图片 | 新增/回复需 onAddComment；编辑已有图片需 onUpdateComment 及根权限策略 |

同一种扩展只注册一次，重复会报错；不同 Provider 的注册互不影响。移除注册即可关闭该扩展，前提是没有旧 props 同时开启。新旧同种配置并存时扩展优先，推荐新接入只使用 extensions。身份/租户/插件实例/权限上下文变化时更换 scopeKey，宿主也隔离其请求与缓存。

### 表情：CommentReactionFeature

| 回调 | 组件传给外部 | 外部返回/负责 |
| --- | --- | --- |
| `getReactions(target)` | `{recordID, commentID, replyID}` | 同步返回 `readonly CommentReaction[]`；这是读缓存，不在 render 中请求网络 |
| `canChange(target)`（可选） | 同一目标 | 是否已加载权威本人状态且当前用户可写；数据未知时应为 false |
| `onChange(input)`（可选） | 目标 + `emojiKey` + `action:'add'|'remove'` | Promise<void>；执行真实添加/撤回，并更新宿主受控回应数据 |
| `loadUsers(input, signal)`（可选） | 目标 + emojiKey + cursor | `{userIDs:number[], nextCursor?:string}`；只在确有完整人员分页接口时提供 |

`CommentReaction` 为 `{emojiKey, count, reactedByMe, previewUserIDs?}`。多维表格映射如下：

| 插件字段/输入 | 组件字段/输入 |
| --- | --- |
| 读取的 `key/count/mine/userIDs` | `emojiKey/count/reactedByMe/previewUserIDs` |
| 写入的 `reactionType` | 回调的 emojiKey |
| 写入的 `action:'add'|'delete'` | 回调的 `action:'add'|'remove'`，将 remove 转成 delete |

请求对接 `getRecordCommentReactions` / `updateRecordCommentReaction`，也可从 `listRecordComments(needReaction:true)` 初始化缓存。读取字段省略表示未知，不能默认 mine=false；getter 可暂时返回 []，同时 canChange 必须阻止未知状态的写入。已加载空数组才表示确实无人回应。

宿主 onChange 的时序：按回复串行 → 写入 → 将已确认的 add/remove 更新到当前受控缓存并触发 React 更新 → resolve → 单独刷新核对。写失败 reject；刷新失败只能标记读取失败，不能 reject 已成功写入，也不能回退已提交操作。成功后不能仅修改一个普通 Map 而不触发宿主渲染。组件处理目标交互锁；回应数据及更新策略仍归宿主，注册不会自动增加一份回应缓存。

当前 getRecordCommentReactions 的 userIDs 只是人员预览，不等于完整分页接口；没有对应接口就省略 loadUsers，不能用预览数组声称已加载全部成员。保留历史表情键，不能擅自重编码。

### 云文档：CommentDocumentSource

| 回调 | 组件传给外部 | 外部返回 |
| --- | --- | --- |
| `search(args)` | `{query, kind, cursor?, signal}` | `{items:MentionOption[], nextCursor?:string}` |
| `recommend(args)`（可选） | `{kind, cursor?, signal}`，裸 @ 默认候选 | 同上；未提供时可由 search 处理空 query |
| `resolve(refs, signal)` | MentionRef[]，用于已有评论/编辑器引用回显 | MentionResult[]，按 ref 标识返回可读元数据或权威不可用状态 |

source 还必须有 scopeKey。文档 ref 使用 `{kind:'document', id:token, resourceType:type}`；id 是文档 token，不能放到人员 ID 字段。文档候选通常为 `{ref, label:title, href:url, description?}`；解析成功再带 `status:'resolved'`。`description` 可由真实 editTime（Unix 秒）生成“最近修改：…”；不把标题、图标和修改时间写进评论 content。

对接 `getCommentDocuments` 时，按当前元数据转换：

| 宿主操作 | 插件输入/输出转换 |
| --- | --- |
| 关键词搜索 | 输入 query、pageToken=cursor；documents 映射成 items，hasMore 时 pageToken 映射成 nextCursor |
| 裸 @ 推荐 | 空 query 的搜索/推荐请求；用同样的结果映射 |
| 已有引用解析 | 输入 refs，每项 `{token:ref.id, type:ref.resourceType}`；按 token + type 对齐返回结果 |
| 完整 URL 查询 | 可用公共 documentRefFromUrl 识别后走 refs 解析；不要把 URL 当标题关键词搜索 |

只给文档来源发送文档 refs；需要分批时每批不超过当前 schema 上限（已联调版本为 50）。请求前后检查 signal，取消/过期结果不得写回新会话。只返回当前用户有权限的 title/url；文档缺失但没有具体错误原因时，不凭缺失推断“已删除”或“无权限”，不猜标题。

**文档扩展只负责查找和回显，不另设“发送文档评论”接口。** 选中文档后，组件在 Provider 的 onAddComment/onUpdateComment 中输出 `{type:'link', url}`。普通评论与文档引用使用同一新增/编辑链路；插入引用不改变分享权限。commentDocuments 已自动合并人员来源和启用候选，不要再套 withDocumentSource 或额外传 enableDocuments。

### 图片：CommentImageFeature

当前多维表格插件不提供图片评论写入，所以默认不开启。以下是组件给自备完整图片后端的宿主使用的合同，不代表已有某个图片 Action。

| 回调 | 组件传给外部 | 外部返回/负责 |
| --- | --- | --- |
| `getImages(target)` | `{recordID, commentID, replyID}` | 同步返回 `readonly CommentImage[]`，每项含 id/url，可含 name/width/height；来自宿主持久化数据/缓存 |
| `onAddComment(input)`（可选） | `{recordID, commentID?, content, images}` | Promise<CommentIDs>；上传新文件并创建**整条**消息；新讨论不带 commentID，回复保留原 commentID |
| `onUpdateComment(input)`（可选） | 上述字段 + 必填 commentID/replyID | Promise<CommentIDs>；上传新增文件、保留已有图片、保存最终消息内容与完整附件列表 |

`images` 中每一项是以下两种之一：

```ts
import type { CommentImageInput, CommentIDs } from '@/components/business-ui/record-comments';
// CommentImageInput：
// { kind: 'local', localID: string, file: File }
// { kind: 'existing', image: { id: string, url: string, name?: string, width?: number, height?: number } }
// CommentIDs：{ commentID: string, replyID: string }
```

带图片时，扩展的写回调拥有整个提交，不是“先调用普通新增，再独立发图片消息”。纯图片消息的 content 可以为空；一次提交返回同一条消息的真实 commentID/replyID。File 只交给宿主上传；持久化附件 ID/可回读元数据，不能保存 blob URL，也不能把 File 塞入文字插件 content。

编辑输入包含保留的 existing 项和新选的 local 项，宿主按最终列表保存；删除全部图片时 images=[]，原消息曾含图仍走图片编辑回调。若根文字写回调缺失，扩展还可能作为文字提交的回退并收到 images=[]，不要假设该数组始终非空。缺图片编辑回调时不开放已有图片消息的编辑，避免保存文字时丢图。

成功返回真实数字字符串 ID，并让后续 getImages 回读到持久化图片；鉴权 URL 过期由宿主刷新。删除消息仍走 Provider 的 onDeleteComment，附件生命周期由后端按引用关系管理。上传成功但创建消息失败的清理、请求幂等及超时结果核对也由宿主后端负责；不确定是否已写入时沿用 outcome=unknown，不能盲目重传。

## 可选能力与权限

- **表情回应**：通过 `commentReactions` 注册 `getReactions/onChange`（兼容旧 `reactions` 参数），可选 `canChange/loadUsers`。列表省略 reactions 表示未知，不能当作无人回应，`mine` 也不能根据截断的 `userIDs` 推断。宿主按回复串行写入，成功先更新当前回应缓存，再刷新；失败只回退该目标，刷新失败不能回退已提交动作。读取不到权威 membership 时禁用切换，保留历史表情键（如 `MediumThumbsup`）。
- **云文档引用**：通过 `commentDocuments` 注册当前用户授权的来源（兼容旧组合方式）。搜索候选的 `description` 使用接口的 `editTime`（Unix 秒）格式化为“最近修改：10月26日 20:41”等元数据副标题；缺失时间就省略，不伪造。只查询当前用户可读的元数据，搜索与解析都应检查权限；不得以 owner/其他用户补查私密标题，插入引用不更改分享权限。写入是 `{type:'link',url}`；持久化 URL，不把标题/图标当作请求字段。请求被取消后检查 signal，丢弃过期结果。解析不可读时使用组件的灰色引用状态，不能假称可读。
- **图片**：当前多维表格插件未接入图片评论，不注册 `commentImages`、不传 `images`，不展示上传入口。`images` 仅是宿主自备上传/持久化能力时的独立扩展；不得把 File/blob URL 塞入插件 content。
- **人员卡片/链接**：通过 `onMentionClick/getCommentLink` 由宿主承接；未提供对应回调时不展示无效操作。


## 交互保持约束

复用组合组件及其共享状态流，不在宿主外包一层“增强交互”。

- 消息菜单“删除”直接请求选中 replyID，不加确认弹窗；新增、回复、编辑和删除成功后不追加成功 toast。复制链接成功后关闭菜单，不在正文下插入成功提示。
- 保留发送等待时的蓝色 loading、失败消息上的错误图标与“点击重试”；不要添加“发送中”“保存中”“已同步”“已显示全部评论”等额外可见文案。读屏用 aria-label/status 不属于额外可见提示，不要移除。
- 点击回复在支持人员引用时自动插入其他作者提及；回复自己不插入本人 @，不支持引用的接口使用普通文本回复。人员悬浮底色、提及搜索面板与 placeholder 由组件样式管理，宿主只控制外层尺寸，避免全局 button/a/p 样式覆盖。
- 只有确认未写入的失败才能重试；结果未知时保留内容并由宿主刷新核对，不能为追求视觉一致开放可能重复发表的重试。初次读取、分页、剪贴板拒绝等失败仍要保留必要的恢复入口，不得吞错。

新增交互或提示前先取得目标官方界面的截图/操作证据；没有证据的状态说明为接入扩展，不能声称已与官方完全对齐。验收要分别记录官方实测、真实 Action 回读、本地故障用例和未覆盖项。图片上传不在当前真实插件验收范围。

## 完成前验收

更改组合接口时先在渲染后的模板中验证 Provider 无外层 DOM、跨布局回复、只读列表、独立输入框和兼容 CommentPanel；验证不注册时隐藏、注册后启用、Provider 隔离与旧参数兼容；分别检查回复归属、行内编辑、首条删除提升/其他回复保留、成功前后及失败的乐观状态、记录切换隔离，不能只测状态类而不挂载视图。

业务接入必须在真实目标环境完成新增→回复→编辑→刷新回读→删除；有回应能力时验证添加/撤回并刷新，有文档能力时验证搜索/插入/重新打开。检查键盘提及选择、单条/空结果、慢网络等待与失败重试、身份/记录切换、分页去重。只在本地 mock 页通过不能声称真实链路完成；图片未接入应明确说明。
