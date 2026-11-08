---
name: comments-guide
description: Use when integrating comment lists, reply editors, mentions, reactions or comment adapters in an application. 触发词：评论组件、评论回复、编辑删除评论、表情回应、评论 OpenAPI、useComments、CommentAdapter
steering: true
steering-topic: comments_guide
match-template-name: nestjs-react-fullstack
---

# 评论组件接入

先检查项目中实际存在的组件和导出。已有 `@/components/business-ui/comments` 且导出 useComments 时，默认使用该入口，先读目录内 README.md 和 contracts.ts。只有旧 `record-comments` 时按 plugin-guide 的兼容指引接入；两者都不存在时，不编造 import，也不声称模板已内置该组件，先确认组件的交付方式。评论不要求安装多维表格插件；按真实数据源实现 adapter。

## Quick Reference

| 场景 | 方式 |
|---|---|
| 普通页面接入 | useComments + CommentsProvider value + CommentList/CommentComposer |
| 默认完整布局 | CommentPanel value |
| 自有缓存/订阅 | 保留的受控 props，外层负责读取和分页 |
| 多维表格 Action | 先读 plugin-guide 的真实 schema；旧 record-comments 入口仍兼容 |
| OpenAPI / 自有后端 | 浏览器调用应用后端，adapter 映射协议、身份和权限 |

```tsx
const comments = useComments({resourceKey:recordId, currentUser, adapter});
return (
  <CommentsProvider value={comments}>
    <CommentList />
    <CommentComposer />
  </CommentsProvider>
);
```

页面负责外层布局。Provider 不生成布局 DOM，同一 Provider 挂一个主输入框。

## 实施顺序

1. 读取真实服务 schema 与权限，提供 CommentAdapter：scopeKey 标识服务/租户/认证上下文，list 返回规范化 threads 和 nextCursor。组件/消息 ID 保留字符串，时间转换为毫秒。
2. 需要写入才提供 create/update/remove。新增返回真实 threadId/messageId；回复保留 threadId 并传精确 replyToMessageId。remove 只删选中消息；首条删除后其他消息顺位提升，不能偷偷调用级联删除整串的接口。
3. list 有下一页就返回 nextCursor；讨论的回复没读全返回 nextReplyCursor 并实现 listReplies。hook 自动处理加载触发、并发保护、结果去重、旧读取和写后静默回读，页面不要再维护 loading/临时评论队列。
4. 可选能力放在 adapter：people.source 提供 @ 搜索/推荐/解析；documents 提供文档 source；reactions 提供目录和修改方法；images:true 仅在 create/update 确能持久化附件时开启。注册不会制造下游接口。
5. 写成功就 resolve，刷新失败由 hook 单独记录。确定未应用用 outcome:not-applied；未知结果不盲重试。后端支持操作标识时回传 clientOperationId 对应 context.operationId；没有证据不按正文猜测去重。
6. 验收新增、往返回复、编辑并刷新、删除首条提升/其他回复保留/最后消息消失，以及初始/空/错误/重试、两层分页、切换账号与对象、旧响应。开启的可选能力分别验收选择、提交与回读；图片没接入就明确说明。

## 身份与服务约束

当前运行类型使用带 namespace 的字符串引用。需要平台人员卡片/目录时，在后端 adapter 转换 open_id 与妙搭 userId，保证作者、currentUser、目录和写入 @ 在同一身份域。不能把两种 ID 直接混用；转换失败不猜人，不提权。组件不内置身份转换，具体服务需要转换时由应用后端完成。

OpenAPI 整篇文档评论不支持回复，块级评论需要真实 anchor；映射 canReply。服务特有正文长度、可写节点和授权限制放 adapter.validateDraft/后端，不能改组件限制其他服务。

## Common Mistakes

| 错误 | 正确做法 |
|---|---|
| 新增完成后手动设整列表 loading | useComments 已静默回读，不叠加第二套刷新逻辑 |
| 复制后端原始评论进组件 | adapter 转成 CommentPage/CommentContent，未知节点保留为 unsupported |
| 只返回第一页但声称完整 | 返回真实游标，实现两层分页 |
| 刷新失败 reject 已成功的写 | 写入和回读分开，hook 负责后者 |
| 注册图片/文档却没有真实写入能力 | 按服务能力启用，不编造接口，不丢已有内容 |
| 源码中有 CSS 就认为样式完整 | 项目必须加载模板全局 index.css，浏览器检查实际样式 |
| 新旧 props 与 value 混传 | 两种接入方式择一；旧 API 继续兼容 |
