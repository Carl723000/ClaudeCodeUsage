# Claude 冷启动 A/B 对照——v2.3.1 候选

这是固定语料测量，不是发布基准。两次运行使用同一份确定性单文件 Claude JSONL fixture（50,000 条 assistant 记录，覆盖 365 个日历日）和 `America/New_York`。

| 运行 | body reads | 字节数 | 解析行数 | 耗时 | 小时桶 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 基线：逐记录时区/小时 helper | 1 | 17,227,780 | 50,000 | 15,885.58 ms | 8,759 |
| 候选：单 formatter + 近期小时窗口 | 1 | 17,227,780 | 50,000 | 6,791.68 ms | 764 |
| 候选 warm unchanged | 0 | 0 | 0 | 13.47 ms | 不变 |

对照支持这一项窄优化：formatter 创建和无界小时物化确实占用了冷启动时间。日、月、全历史和记录语义保持不变；只把临时小时 sidecar 限制为配置时区最近 30 个民用日。历史日期展开仍从内存中的可见记录得到，绝不重新打开 JSONL。

资源所有权仍是单一生产者：现有 Claude 增量索引拥有解析和聚合，现有刷新协调器拥有 watcher/timer 生命周期。Codex 迁移继续使用现有 worker/index 生产者，并为唯一有界的首次历史整理例外增加 10 秒失焦截止。截止到达后协作式取消、保存安全游标，持久 background state 保持 eligible 以便续跑。warm unchanged 刷新读取零 JSONL；关闭或停用功能时释放 timer、watcher、worker、network lease 和 backfill lease，不留下长期资源。

该 fixture 不代表 2.4-GB 墙钟时间或能耗基准；这仍是发布候选的依赖项。
