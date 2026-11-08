# 通用评论接入

默认接入改用共享的 [comments-guide](../../comments-guide/SKILL.md)：第三方 Agent 主要实现 CommentAdapter，用 useComments 和 Provider value 挂载。高级受控 props、旧 record-comments 合同继续兼容。本文下方保留服务适配与身份边界参考。

先检查项目实际存在的组件和导出；未交付的入口不能直接 import。用户需要评论 UI，但数据来自 OpenAPI、自建服务或其他平台时，使用 `@/components/business-ui/comments`，先读该目录 `README.md` 和 `contracts.ts`。不要为接入云文档强行安装多维表格插件。组件仅负责 UI、编辑器、交互和乐观更新；外部 adapter 负责真实请求、协议转换、OAuth、权限、缓存和分页。

这是已做 OpenAPI 实测的新入口；兼容的多维表格 Action 入口仍为 `record-comments`，见 `record-comments.md`。两个入口数据类型不同，不能直接混传。

## 最小实施顺序

1. 先读取真实服务接口与权限范围，再写 adapter，把数据映射为 `CommentThread[]`。评论/消息 ID 为字符串；用户用 namespace + 字符串 ID，OpenAPI open_id 禁止转数字。时间转毫秒，updateTime 缺失不崩溃，也不伪造编辑标记。
2. 使用 `CommentsProvider + CommentList + CommentComposer` 自行布局，或 `CommentPanel` 默认布局。CSS 保持组件自带版本，不用全局 button/a/p 重置覆盖组件。
3. create/update 必须返回真实 threadId/messageId，可同时返回权威 message；delete 只删除选中消息，首条删除后第二条提升。没有整串删除状态就省略 threadDeleted，由刷新核查，不能伪造。
4. 写入成功与刷新失败分开处理；确定未应用才允许重试，不确定结果不能重复发送。外部请求序号和写入屏障丢弃旧响应，分页去重并检测游标不前进。
5. 可选能力默认不启用：人员目录 + input.userMentions；文档 commentDocuments + 外部 source；回应 commentReactions + allowedKeys/onChange；图片 commentImages + 宿主上传。注册 UI 不等于下游支持，不能编造接口或权限。图片未接入则不注册。
6. 验收真实新增、回复、编辑、刷新、删除首条提升与其他回复保留；有回应时测添加和撤回；测 @ 鼠标/键盘选择和引用回显、读写失败及 scope/subject 切换。只有 mock 通过不能声称真实接口通过。

## 云文档 OpenAPI 边界

- Token 保留后端，按用户授权和文档权限执行；不能用 owner 身份绕权限，前端权限仅控制入口。
- 本次实测 `drive/v1/files/.../new_comments`、comments/replies、reply PUT/DELETE，及 `drive/v2/files/.../comments/reaction`。整篇文档评论 `is_whole:true` 不支持回复，块级评论需要有效 anchor；adapter 设置 canReply，不能展示无效回复入口。
- 评论读取嵌套回复及分页必须完整处理；回应名单可能截断，不能据此推断 mine:false。
- 云文档引用写入 docs_link；显示标题需外部元数据解析，解析失败不能直接显示“无权限”。人员目录和文档搜索是独立能力，不能把有限候选写成全组织搜索。
- Agent 生成期可用 CLI 创建测试资源；应用运行时必须调用自己的后端接口或 SDK，不能 shell 执行 CLI。

仓库可复现示例：`scripts/__tests__/fixtures/record-comments/openapi/README.md`。它是开发验收工具，不是生产认证实现。
