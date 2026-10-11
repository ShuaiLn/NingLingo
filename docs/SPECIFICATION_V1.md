# NingLingo 完整首版开发计划

Product source of truth: the owner-supplied v1 specification, archived here before connected integration. The local-stage scope at the end narrows the delivery stage without changing product behavior.

## 1. 产品与技术方案

做一个个人使用、支持跨设备同步的语言学习网站，覆盖**日语、西班牙语、现代希腊语**。界面、语法解释和默认释义使用英文。

技术栈：**Next.js App Router + TypeScript + Tailwind CSS + Supabase Auth/Postgres + Vercel**。依赖锁定稳定版本，提交 lockfile。

- 邮箱密码登录，预建个人账号，关闭公开注册。
- 共用一套页面：Dashboard、Vocabulary、Quiz、Reading、Grammar、Alphabet、Progress；另有 Settings。
- 路由使用 `/[language]/...`，语言代码固定为 `ja | es | el`。
- 桌面使用侧栏，手机使用紧凑导航；白色背景，日语淡粉、西语淡橙、希腊语淡蓝。
- 学习日按账号时区计算，默认 `America/Tijuana`，可在设置中修改。

## 2. 核心功能与行为

### Vocabulary 与 CSV

支持词表管理、单词增删改查、搜索、分类、多选和导出。

```csv
word,reading,translation,type,category,example,notes
犬,いぬ,dog,noun,animals,犬が好きです。,
```

- `word`、`translation` 必填，其余可空；支持 UTF-8、BOM、引号、逗号和换行。
- 上传后展示有效行、重复行、错误行及原因，确认后导入有效内容。
- 完全相同的“词＋读音＋释义”跳过；同形异义词可以分别保存。
- 日语使用 `<ruby>` 显示汉字与读音，支持平假名、片假名切换，默认片假名。只转换已有假名，不自动推断汉字读音。
- 输入题可在词条中维护多个可接受答案。

### 四种 Quiz

每次开始前选择一种题型，冻结本次词条、答案和题型：

1. **Word → Meaning**：选择释义。
2. **Meaning → Word**：选择对应单词。
3. **Typing**：输入当前单词的英文释义。
4. **Japanese Reading**：选择日语读音，仅使用具有读音数据的词条。

选择题生成 2–4 个不重复选项，干扰项来自本次所选词，并排除同义多解。不足两个有效选项时提示增加单词或选择 Typing；单词只有一个时仍可使用 Typing。

输入评分忽略首尾空格、英文大小写及等价 Unicode 编码；同义答案依靠明确维护的答案列表，不自动猜测。

日语读音题每题默认隐藏假名，提供 **Show/Hide Reading**。显示假名和播放音频都不影响正确率或复习评分。

**错题重测规则**

间隔指两次测试之间已完成的题数。实际入题词数为 `n`：

| 实际入题词数 | 错题重测间隔 |
| --- | --- |
| 1 | 0，显示纠正后立即重测 |
| 2–3 | 随机 1 至 `n−1` 题 |
| 4–10 | 随机 3 至 `n−1` 题 |
| 11 及以上 | 随机 3–10 题 |

- 开始前显示实际间隔范围。
- 答错时，在允许范围内随机预留一个尚未占用的未来题位；重测仍错则重新安排。
- 等待重测的词不提前出现；空档优先测试未出现的所选词，再使用已完成重测或已答对的所选词。
- 最后一批错题可以延长测验，不截短间隔，也不补入未选词。
- 所选词全部测过且没有待重测项时结束；提供主动结束、保存和继续入口。

### Reading 与翻译

支持粘贴文章和上传 UTF-8 TXT，保存标题、正文、语言及阅读状态。

查询优先级固定为：**人工标注 → 个人词库 → 上下文缓存 → DeepL**。

- 日语优先匹配词库中的最长词组；未知内容按语言分词。西语和希腊语保留重音符号。
- 可悬停、键盘聚焦或点击查词；也可选择任意文本填写释义、读音或关联词条。
- 未知词停留约 350ms 后请求 DeepL，发送选中词及所在句作为上下文；不预先翻译整篇文章。[DeepL 翻译接口](https://developers.deepl.com/api-reference/translate/request-translation)
- 机器结果标注来源，允许修改后加入 Vocabulary。DeepL 结果仅作为译文，读音、词性和词典原形由词库或人工补充。
- 缓存包含用户、语言、词和句子上下文，合并重复请求。
- 修改正文后提示清除原有位置标注，防止标注错位。

使用新 **DeepL API Developer** 免费套餐：规格指定累计 **100 万字符**，耗尽后不重置。读取实际额度，额度耗尽或服务失败时保留手动释义入口，不自动转付费。[官方套餐说明](https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans)

### 共用音频组件

```tsx
<AudioButton text="犬" language="ja" />
```

Vocabulary、每一道 Quiz、Reading 弹窗、Alphabet 和 Grammar 例句共用此组件；义→词题的每个选项也提供播放按钮。

- 首版使用浏览器 `SpeechSynthesis`，目标语音为 `ja-JP`、`es-ES`、`el-GR`。
- 优先匹配指定地区，其次匹配同语言声音；缺少对应语言时提示不可用。
- 处理语音列表延迟加载；点击播放，重复播放不改变答案或进度。
- 全站同时播放一条语音；切题、切页面或切语言时停止。
- 选项内的音频按钮不会触发选择答案。
- 日语单词优先朗读已有假名；字母表单独保存用于朗读的字母名称和例词。

声音由设备与浏览器提供，三语可用性在运行时检测。[SpeechSynthesis 文档](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)

### Alphabet、Grammar 与 Progress

- **Alphabet**：日语平假名、片假名、浊音、半浊音与拗音；西班牙语字母表；现代希腊语大小写及词尾 `ς`。每项包含名称、发音提示、例词和音频。
- **Grammar**：首批日语 100、西语 80、希腊语 60 个知识点，重点覆盖初级与基础进阶。每课包含英文解释、结构、至少 3 个例句及翻译、至少 5 道选择练习及解析；练习正确率达到 80% 标记完成。
- **跨天复习**：使用 `1、3、7、14、30、60、120` 天的阶段。到期复习全对则晋级；出现错误则回到次日复习。每词每天最多正向晋级一次，提前练习不推迟到期日。
- **统计**：展示词数、首次作答正确率、弱词、到期复习、学习连续天数及语法完成进度。重测与填充题不会重复提高复习阶段。

## 3. 数据与接口

Supabase 按以下职责组织数据：

- **词库**：词表、词条、可接受答案、学习阶段与到期日期。
- **阅读**：正文、正文版本、位置标注、翻译缓存。
- **课程**：语法知识点、例句、练习、内容版本、来源及审校记录；用户课程进度单独保存。
- **测验**：会话快照、题目顺序、预留重测位置、作答记录和会话版本。

| 接口 | 用途 |
| --- | --- |
| `POST /api/quiz/sessions` | 接收语言、所选词 ID 和题型，创建测验快照 |
| `POST /api/quiz/sessions/:id/answers` | 提交答案与版本号，返回评分和下一题 |
| `POST /api/readings/:id/lookup` | 接收正文版本及文本范围，按优先级返回释义 |
| Vocabulary 导入操作 | 根据预览确认结果，事务性写入有效行 |

每次答题保存云端；重复提交保持幂等，多设备发生版本冲突时加载最新会话。复习阶段在会话完成或主动结束时，每词只结算一次。

所有个人数据启用所有权 RLS；服务端验证登录和记录归属。DeepL 密钥仅放在服务端环境变量中。[Supabase SSR 文档](https://supabase.com/docs/guides/auth/server-side/nextjs)

## 4. 语法内容准备与开发顺序

内容准备从项目初始化阶段并行开始：

- **日语**：导入 [OpenJLPT](https://github.com/evanclan/OpenJLPT) 候选数据，优先 N5，补充基础 N4；保留 CC BY-SA 4.0 署名与来源。
- **西班牙语**：依据 [Wikibooks Spanish](https://en.wikibooks.org/wiki/Spanish/Contents) 整理课程，逐课编写和审校说明、例句与练习。
- **现代希腊语**：参考 [Kallipos 初级语法教材](https://repository-web.kallipos.gr/handle/11419/4393) 等资料整理课程；Greek-GUD 留作后续形态分析材料。
- **例句补充**：可筛选 [Tatoeba](https://tatoeba.org/en/terms_of_use) 的直接翻译配对，保存原句、译句作者及各自许可。
- 固定来源版本，使用 `draft → reviewed → published` 流程；每课记录人工审校者、日期、许可和修改说明。完整首版上线前完成全部 240 课审校。

| 阶段 | 交付 |
| --- | --- |
| M0 | 工程、登录、数据库、三语言导航、响应式界面 |
| M1 | Vocabulary、CSV 预览导入、共用音频组件 |
| M2 | 四种 Quiz、错题调度、保存继续、跨天复习 |
| M3 | Reading、人工标注、DeepL 缓存与额度处理 |
| M4 | Alphabet、240 课 Grammar、练习和进度 |
| M5 | Dashboard、完整流程验收、Vercel 部署 |

## 5. 测试与验收

- **词库**：三种语言字符、CSV 引号换行、重复词、同形异义、错误行提示及导入导出。
- **测验**：`n=1、2、3、4、10、11`；重测位置冲突、连续答错、尾部重测、少选项、多解过滤、刷新恢复和重复提交。
- **提示与音频**：假名每题默认隐藏；显示与播放不影响评分；音频不会选答案；语音延迟加载、缺失、快速切换及播放失败均有正确状态。
- **阅读**：人工标注优先、日语变形词、希腊语重音、不同上下文缓存、正文修改、DeepL 超额与网络失败。
- **复习与同步**：同日不重复晋级、提前练习不延期、后续错误回到次日、时区边界、电脑手机继续同一会话及数据隔离。
- **内容**：240 课全部具备审校记录、有效例句、唯一正确练习答案和来源署名。

最终验收流程：**导入词库 → 选词测验 → 错题重测 → 保存并跨设备继续 → 阅读查词并加入词库 → 完成语法练习 → Dashboard 更新复习与进度**。

## Current local-stage delivery scope (owner supplied)

Implement everything that can be safely built before connecting Supabase or GitHub. Use replaceable `VocabularyRepository`, `QuizRepository`, `ReadingRepository`, `GrammarRepository`, `ProgressRepository`, `SettingsRepository`, and personal-session contracts. Browser persistence must be isolated behind those interfaces. Add `randomSeed` and `schedulerVersion` to reproducible quiz snapshots. Use a mock TranslationProvider without DeepL requests. Seed complete alphabets and representative draft grammar lessons; do not fabricate 240 reviewed production lessons.

Do not connect Supabase, implement real Auth, create/apply remote schemas/RLS/Storage/RPCs/migrations, request credentials, call DeepL, import the production grammar set, configure GitHub, push, or deploy to Vercel. Schema planning and integration documentation are allowed.

The local stopping point requires all eight pages and major flows usable, complete CSV/quiz/retry/SRS/Reading/Alphabet/Grammar sample/Dashboard behavior, and passing lint, typecheck, unit tests, and production build. Deliver an integration handoff describing completion, proposed schema/RLS/Auth/environment variables, DeepL steps, mock replacements, migration order, and unresolved integration/content work. Stop before any connected-data work until the owner configures those services.
