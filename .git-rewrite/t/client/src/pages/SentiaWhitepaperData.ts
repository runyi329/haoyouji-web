/**
 * Sentia (SNT) Whitepaper Content
 * Version 1.0 · March 2025
 * Bilingual: Chinese / English
 */

export const WHITEPAPER_VERSION = "v1.0";
export const WHITEPAPER_DATE = "March 2025";

export interface Section {
  id: string;
  num: string;
  titleZh: string;
  titleEn: string;
  contentZh: string;
  contentEn: string;
  subsections?: {
    titleZh: string;
    titleEn: string;
    contentZh: string;
    contentEn: string;
  }[];
}

export const SECTIONS: Section[] = [
  // ── 0. Abstract ──────────────────────────────────────────────────────────
  {
    id: "abstract",
    num: "00",
    titleZh: "摘要",
    titleEn: "Abstract",
    contentZh: `Sentia（SNT）是一个构建于 BNB Chain 之上的 AI 原生区块链协议，旨在将大语言模型（LLM）推理能力与去中心化网络基础设施深度融合，形成可自主运行的智能经济体系。

本协议的核心创新在于引入"感知代理网络"（Sentient Agent Network，SAN）——一组能够自主感知、决策并执行链上/链下任务的 AI 代理集群。这些代理通过 SNT 代币进行激励对齐，在无需中心化协调的前提下完成数据交换、服务撮合与价值分配。

在应用层，Sentia 将 AI 推理能力延伸至社会关系网络领域。协议内置的"关系图谱引擎"（Relational Graph Engine，RGE）能够对用户的社交行为、人脉结构与协作历史进行建模，为 AI 代理提供上下文感知能力，从而在 DeFi、DAO 治理、内容分发等场景中实现更精准的个性化服务。这一设计使 Sentia 与纯粹的算力市场项目形成差异化定位——我们相信，AI 的终极价值在于理解并增强人类的社会连接，而非仅仅提供算力租赁。

SNT 代币作为协议的原生经济媒介，承担服务支付、节点质押、治理投票与生态激励四重职能。总供应量固定为 10 亿枚，不可增发。`,
    contentEn: `Sentia (SNT) is an AI-native blockchain protocol built on BNB Chain, designed to deeply integrate large language model (LLM) inference capabilities with decentralized network infrastructure, forming an autonomously operating intelligent economic system.

The core innovation of this protocol lies in the introduction of the "Sentient Agent Network" (SAN) — a cluster of AI agents capable of autonomous perception, decision-making, and execution of on-chain/off-chain tasks. These agents achieve incentive alignment through SNT tokens, completing data exchange, service matching, and value distribution without centralized coordination.

At the application layer, Sentia extends AI inference capabilities into the domain of social relationship networks. The protocol's built-in "Relational Graph Engine" (RGE) models users' social behaviors, network structures, and collaboration histories, providing AI agents with contextual awareness capabilities to deliver more precise personalized services in DeFi, DAO governance, content distribution, and other scenarios. This design differentiates Sentia from pure computing power marketplace projects — we believe the ultimate value of AI lies in understanding and enhancing human social connections, not merely providing computing power rental.

The SNT token, as the protocol's native economic medium, serves four functions: service payment, node staking, governance voting, and ecosystem incentives. The total supply is fixed at 1 billion tokens, with no possibility of additional issuance.`,
  },

  // ── 1. Introduction ──────────────────────────────────────────────────────
  {
    id: "introduction",
    num: "01",
    titleZh: "引言",
    titleEn: "Introduction",
    contentZh: `人工智能正在经历从"工具"到"代理"的范式转变。过去十年，AI 系统主要以被动响应的形式存在——用户输入，模型输出。然而随着大语言模型能力的指数级提升，AI 代理已具备规划、推理、调用外部工具并持续学习的能力，这标志着一个全新时代的到来。

与此同时，区块链技术在经历了 DeFi、NFT 等应用浪潮后，正面临一个根本性挑战：如何将链上协议与真实世界的复杂需求连接起来？现有的智能合约体系依赖预定义逻辑，无法处理开放性、模糊性的现实问题。AI 代理恰好填补了这一空白——它们能够理解自然语言指令、动态调整执行策略，并在链上完成可验证的操作记录。

Sentia 的设计出发点正是这一交汇点。我们认为，AI 与区块链的结合不应停留在"将 AI 模型的哈希值上链"这样的浅层集成，而应构建一套完整的经济激励体系，使 AI 能力的生产者、消费者与验证者在链上形成自洽的市场均衡。

更重要的是，我们观察到现有 AI 区块链项目普遍忽视了一个关键维度：人类社会关系网络。人脉、信任、协作历史是人类经济活动中最重要的软性资产，却在当前的链上协议中几乎缺席。Sentia 通过关系图谱引擎将这一维度纳入协议设计，使 AI 代理能够在充分理解社会上下文的前提下提供服务，从而释放出远超纯算力市场的应用价值。`,
    contentEn: `Artificial intelligence is undergoing a paradigm shift from "tool" to "agent." Over the past decade, AI systems have primarily existed in the form of passive responses — users input, models output. However, as the capabilities of large language models have grown exponentially, AI agents now possess the ability to plan, reason, invoke external tools, and continuously learn, marking the arrival of a completely new era.

Meanwhile, after experiencing waves of DeFi and NFT applications, blockchain technology faces a fundamental challenge: how to connect on-chain protocols with the complex demands of the real world? Existing smart contract systems rely on predefined logic and cannot handle open-ended, ambiguous real-world problems. AI agents fill exactly this gap — they can understand natural language instructions, dynamically adjust execution strategies, and complete verifiable operation records on-chain.

Sentia's design originates precisely at this intersection. We believe that the combination of AI and blockchain should not remain at shallow integration such as "putting the hash of an AI model on-chain," but should build a complete economic incentive system that allows producers, consumers, and validators of AI capabilities to form a self-consistent market equilibrium on-chain.

More importantly, we observe that existing AI blockchain projects universally overlook a critical dimension: human social relationship networks. Personal connections, trust, and collaboration history are the most important soft assets in human economic activities, yet they are almost entirely absent from current on-chain protocols. Sentia incorporates this dimension into protocol design through the Relational Graph Engine, enabling AI agents to provide services with full understanding of social context, thereby releasing application value far exceeding pure computing power markets.`,
  },

  // ── 2. Market Background ─────────────────────────────────────────────────
  {
    id: "market",
    num: "02",
    titleZh: "市场背景与机遇",
    titleEn: "Market Background & Opportunity",
    contentZh: `**全球 AI 市场规模**

根据 Grand View Research 的数据，2023 年全球 AI 市场规模达到 1,971 亿美元，预计到 2030 年将以 37.3% 的年复合增长率扩张至 1.8 万亿美元。其中，AI 即服务（AIaaS）细分市场增速最为显著，企业对按需 AI 推理能力的需求正在快速释放。

**去中心化 AI 的崛起**

中心化 AI 服务提供商（如 OpenAI、Google、Anthropic）虽然技术领先，但其封闭的 API 生态、不透明的定价机制以及数据隐私风险，正在推动开发者和企业转向去中心化替代方案。Bittensor、Fetch.ai 等项目的市值增长印证了这一趋势——去中心化 AI 基础设施赛道在 2023-2024 年间整体市值增长超过 400%。

**社交图谱的商业价值**

LinkedIn 的估值超过 260 亿美元，微信的月活用户超过 13 亿，这些数字背后揭示的是社交关系网络作为商业基础设施的巨大价值。然而，这些平台上积累的社交图谱数据完全由中心化公司掌控，用户既无法拥有自己的数据资产，也无法从中获得经济收益。

**Sentia 的市场定位**

Sentia 处于 AI 基础设施与社交图谱经济的交叉点，目标是成为连接 AI 能力与人类社会网络的协议层。我们预计，随着 Web3 社交应用的兴起，链上社交图谱将成为价值数百亿美元的基础设施资产，而 Sentia 的关系图谱引擎将是这一市场的核心协议之一。`,
    contentEn: `**Global AI Market Scale**

According to Grand View Research, the global AI market reached $197.1 billion in 2023 and is expected to expand to $1.8 trillion by 2030 at a compound annual growth rate of 37.3%. Among these, the AI-as-a-Service (AIaaS) segment shows the most significant growth, with enterprise demand for on-demand AI inference capabilities rapidly being released.

**The Rise of Decentralized AI**

While centralized AI service providers (such as OpenAI, Google, Anthropic) are technically leading, their closed API ecosystems, opaque pricing mechanisms, and data privacy risks are driving developers and enterprises toward decentralized alternatives. The market cap growth of projects like Bittensor and Fetch.ai confirms this trend — the decentralized AI infrastructure sector saw overall market cap growth exceeding 400% between 2023-2024.

**The Commercial Value of Social Graphs**

LinkedIn's valuation exceeds $26 billion, and WeChat's monthly active users exceed 1.3 billion. The numbers behind these figures reveal the enormous value of social relationship networks as commercial infrastructure. However, the social graph data accumulated on these platforms is entirely controlled by centralized companies — users can neither own their data assets nor derive economic benefits from them.

**Sentia's Market Positioning**

Sentia sits at the intersection of AI infrastructure and social graph economics, aiming to become the protocol layer connecting AI capabilities with human social networks. We anticipate that as Web3 social applications rise, on-chain social graphs will become infrastructure assets worth hundreds of billions of dollars, and Sentia's Relational Graph Engine will be one of the core protocols in this market.`,
  },

  // ── 3. Core Architecture ─────────────────────────────────────────────────
  {
    id: "architecture",
    num: "03",
    titleZh: "核心架构",
    titleEn: "Core Architecture",
    contentZh: `Sentia 协议由四个相互协作的核心层构成，形成完整的技术栈：

**第一层：共识与结算层（BNB Chain）**

Sentia 选择 BNB Chain 作为底层结算网络，原因在于其高吞吐量（每秒处理 2,000+ 笔交易）、低手续费（平均 $0.01-0.05/笔）以及成熟的 DeFi 生态。所有 SNT 代币的转移、质押与治理投票均在此层完成链上记录与最终确认。

**第二层：感知代理网络（Sentient Agent Network，SAN）**

SAN 是 Sentia 的核心执行层，由分布在全球的 AI 推理节点组成。每个节点运行标准化的代理运行时（Agent Runtime），能够接收自然语言任务、调用本地或远程 AI 模型、执行链上操作，并将结果提交至验证层。节点通过质押 SNT 获得运行资格，质押量决定其在任务分配中的优先级权重。

**第三层：关系图谱引擎（Relational Graph Engine，RGE）**

RGE 是 Sentia 区别于其他 AI 区块链项目的核心差异化模块。它以零知识证明（ZKP）为基础，允许用户将自己的社交关系数据（联系人网络、协作记录、信任评分）以隐私保护的方式上链，形成可供 AI 代理查询的关系图谱。AI 代理在执行任务时可以调用 RGE 接口，获取与任务相关的社会上下文信息，从而提供更精准的个性化服务。

**第四层：应用接口层（Application Interface Layer，AIL）**

AIL 提供标准化的 SDK 和 API，允许第三方开发者在 Sentia 协议之上构建应用。目前已规划的应用场景包括：AI 驱动的 DAO 治理助手、个性化 DeFi 策略代理、基于人脉图谱的内容推荐系统，以及企业级 AI 工作流自动化工具。`,
    contentEn: `The Sentia protocol consists of four mutually collaborative core layers, forming a complete technology stack:

**Layer 1: Consensus & Settlement Layer (BNB Chain)**

Sentia selects BNB Chain as the underlying settlement network due to its high throughput (2,000+ transactions per second), low fees (average $0.01-0.05/transaction), and mature DeFi ecosystem. All SNT token transfers, staking, and governance voting are recorded on-chain and finally confirmed at this layer.

**Layer 2: Sentient Agent Network (SAN)**

SAN is Sentia's core execution layer, consisting of AI inference nodes distributed globally. Each node runs a standardized Agent Runtime capable of receiving natural language tasks, invoking local or remote AI models, executing on-chain operations, and submitting results to the validation layer. Nodes obtain operating qualifications by staking SNT, with the staking amount determining their priority weight in task allocation.

**Layer 3: Relational Graph Engine (RGE)**

RGE is the core differentiating module that distinguishes Sentia from other AI blockchain projects. Built on zero-knowledge proofs (ZKP), it allows users to upload their social relationship data (contact networks, collaboration records, trust scores) to the chain in a privacy-preserving manner, forming a relationship graph that AI agents can query. When executing tasks, AI agents can call the RGE interface to obtain social context information relevant to the task, thereby providing more precise personalized services.

**Layer 4: Application Interface Layer (AIL)**

AIL provides standardized SDKs and APIs, allowing third-party developers to build applications on top of the Sentia protocol. Currently planned application scenarios include: AI-driven DAO governance assistants, personalized DeFi strategy agents, content recommendation systems based on social graphs, and enterprise-grade AI workflow automation tools.`,
  },

  // ── 4. Sentient Agent Network ─────────────────────────────────────────────
  {
    id: "san",
    num: "04",
    titleZh: "感知代理网络（SAN）",
    titleEn: "Sentient Agent Network (SAN)",
    contentZh: `**代理的生命周期**

一个 Sentia 代理从注册到退役经历以下阶段：注册（Register）→ 质押（Stake）→ 发现（Discover）→ 执行（Execute）→ 验证（Validate）→ 结算（Settle）。

在注册阶段，节点运营者将代理的能力描述（支持的任务类型、模型规格、响应延迟等）写入链上注册表，并质押不低于 10,000 SNT 作为信用担保。任务发布者通过链上注册表发现符合条件的代理，发起任务请求并锁定相应的 SNT 报酬。代理执行完成后，由随机抽选的验证节点对结果进行评分，评分通过后报酬自动释放。

**任务类型与定价机制**

SAN 支持三类任务：即时任务（Instant Task）、订阅任务（Subscription Task）和竞价任务（Auction Task）。即时任务采用固定价格，适合标准化的 AI 推理请求；订阅任务允许用户按月付费获得持续的 AI 服务；竞价任务通过荷兰式拍卖确定价格，适合高价值、定制化的复杂任务。

**质量保证机制**

为防止代理提交低质量结果，SAN 引入了"声誉权重"（Reputation Weight）机制。每个代理的历史评分被记录在链上，声誉分数影响其在任务分配中的权重。声誉分数低于阈值的代理将被自动降级，质押的 SNT 也将按比例被削减（Slashing）。这一机制确保了网络中 AI 服务质量的持续提升。`,
    contentEn: `**Agent Lifecycle**

A Sentia agent goes through the following phases from registration to retirement: Register → Stake → Discover → Execute → Validate → Settle.

During the registration phase, node operators write the agent's capability description (supported task types, model specifications, response latency, etc.) into the on-chain registry, and stake no less than 10,000 SNT as credit guarantee. Task publishers discover qualified agents through the on-chain registry, initiate task requests, and lock the corresponding SNT reward. After the agent completes execution, randomly selected validation nodes score the results, and the reward is automatically released after the score passes.

**Task Types and Pricing Mechanism**

SAN supports three types of tasks: Instant Tasks, Subscription Tasks, and Auction Tasks. Instant tasks use fixed pricing, suitable for standardized AI inference requests; subscription tasks allow users to pay monthly for continuous AI services; auction tasks determine prices through Dutch auctions, suitable for high-value, customized complex tasks.

**Quality Assurance Mechanism**

To prevent agents from submitting low-quality results, SAN introduces a "Reputation Weight" mechanism. Each agent's historical scores are recorded on-chain, and reputation scores affect their weight in task allocation. Agents with reputation scores below the threshold will be automatically downgraded, and their staked SNT will be proportionally slashed. This mechanism ensures continuous improvement of AI service quality in the network.`,
  },

  // ── 5. Relational Graph Engine ────────────────────────────────────────────
  {
    id: "rge",
    num: "05",
    titleZh: "关系图谱引擎（RGE）与 AI 社交应用",
    titleEn: "Relational Graph Engine (RGE) & AI Social Applications",
    contentZh: `**为什么社交图谱对 AI 至关重要**

当前的 AI 系统在处理个性化任务时面临一个根本性困境：它们对用户的了解极为有限。即便是最先进的 LLM，在没有上下文的情况下，也只能提供泛化的、非个性化的响应。而人类在现实世界中做出决策时，始终依赖于丰富的社会上下文——谁是可信的合作伙伴？谁在某个领域有专业积累？谁与我有共同的协作历史？

RGE 的设计目标正是将这些社会上下文信息以隐私保护的方式提供给 AI 代理，使其能够在充分理解"人"的前提下提供服务。

**技术实现：零知识社交证明**

RGE 采用零知识证明（ZKP）技术，允许用户在不暴露原始数据的情况下证明特定社交属性的存在。例如，用户可以证明"我在某个领域拥有超过 50 个专业联系人"，而无需透露这些联系人的具体身份。这一机制保护了用户隐私，同时为 AI 代理提供了可信的社会背景信息。

**人脉图谱的链上表示**

用户的人脉网络在链上以有向加权图的形式存储，节点代表用户身份（以匿名地址表示），边代表关系强度（由交互频率、协作记录、互相背书等多维度指标计算得出）。图谱数据经过加密存储，仅用户本人和其授权的 AI 代理可以访问完整数据；其他代理只能通过 ZKP 接口查询经过脱敏处理的聚合统计信息。

**应用场景：AI 人脉助手**

基于 RGE，开发者可以构建 AI 人脉助手类应用。例如，当用户需要寻找某个领域的合作伙伴时，AI 代理可以分析用户的人脉图谱，识别出"二度人脉"中具有相关专业背景的潜在合作者，并结合链上协作历史评估其可信度，最终向用户推荐最优匹配结果。这一场景与传统的 LinkedIn 推荐算法有本质区别：数据由用户自主掌控，推荐逻辑透明可审计，且用户可以从自己的数据资产中获得经济收益。

**与主业务的关联**

Sentia 协议在设计上与"好友记"类社交记录应用形成天然协同。用户在日常社交应用中积累的联系人记录、互动频率、账本往来等数据，经用户授权后可以作为 RGE 的输入源，丰富链上关系图谱的维度与精度。这种"线下社交数据 → 链上图谱资产"的转化路径，是 Sentia 区别于其他纯技术型 AI 区块链项目的核心竞争优势之一。`,
    contentEn: `**Why Social Graphs Are Critical for AI**

Current AI systems face a fundamental dilemma when handling personalized tasks: they know very little about users. Even the most advanced LLMs can only provide generalized, non-personalized responses without context. Yet when humans make decisions in the real world, they always rely on rich social context — who is a trustworthy collaborator? Who has professional expertise in a certain field? Who shares a history of collaboration with me?

The design goal of RGE is precisely to provide this social context information to AI agents in a privacy-preserving manner, enabling them to provide services with a full understanding of "people."

**Technical Implementation: Zero-Knowledge Social Proofs**

RGE employs zero-knowledge proof (ZKP) technology, allowing users to prove the existence of specific social attributes without exposing raw data. For example, a user can prove "I have more than 50 professional contacts in a certain field" without revealing the specific identities of these contacts. This mechanism protects user privacy while providing AI agents with credible social background information.

**On-Chain Representation of Social Networks**

A user's social network is stored on-chain in the form of a directed weighted graph, where nodes represent user identities (represented by anonymous addresses) and edges represent relationship strength (calculated from multi-dimensional indicators including interaction frequency, collaboration records, and mutual endorsements). Graph data is stored encrypted, with only the user themselves and their authorized AI agents able to access complete data; other agents can only query desensitized aggregated statistical information through the ZKP interface.

**Application Scenario: AI Networking Assistant**

Based on RGE, developers can build AI networking assistant applications. For example, when a user needs to find a collaborator in a certain field, the AI agent can analyze the user's social graph, identify potential collaborators with relevant professional backgrounds in "second-degree connections," evaluate their credibility based on on-chain collaboration history, and ultimately recommend the best matches to the user. This scenario is fundamentally different from traditional LinkedIn recommendation algorithms: data is autonomously controlled by users, recommendation logic is transparent and auditable, and users can derive economic benefits from their own data assets.

**Connection to Core Business**

The Sentia protocol is designed to form a natural synergy with social record applications like "Friend Journal" (好友记). Contact records, interaction frequencies, ledger transactions, and other data accumulated by users in daily social applications can, with user authorization, serve as input sources for RGE, enriching the dimensions and precision of the on-chain relationship graph. This "offline social data → on-chain graph assets" transformation path is one of Sentia's core competitive advantages that differentiates it from other purely technical AI blockchain projects.`,
  },

  // ── 6. AI Inference Layer ─────────────────────────────────────────────────
  {
    id: "inference",
    num: "06",
    titleZh: "AI 推理层：去中心化模型市场",
    titleEn: "AI Inference Layer: Decentralized Model Marketplace",
    contentZh: `**模型注册与发现**

任何开发者或机构都可以将 AI 模型（包括 LLM、图像生成模型、语音识别模型等）注册到 Sentia 的模型市场。注册时需提交模型的能力描述、性能基准测试结果、定价方案以及不低于 5,000 SNT 的质押。模型在链上以唯一的模型 ID 标识，消费者可以通过标签、性能指标和价格等维度进行筛选。

**推理验证机制**

去中心化 AI 推理面临的核心挑战是：如何在不重新执行推理的情况下验证结果的正确性？Sentia 采用"乐观验证 + 挑战期"机制：推理结果默认被接受，但在 24 小时挑战期内，任何质押了 SNT 的验证者都可以对结果提出挑战。挑战成功则挑战者获得奖励，模型提供者的质押被削减；挑战失败则挑战者损失质押。这一机制在保证效率的同时，为结果正确性提供了经济保障。

**模型组合与 AI 工作流**

Sentia 支持将多个 AI 模型组合成工作流（Workflow），通过有向无环图（DAG）描述模型之间的数据流关系。例如，一个完整的"文档智能分析"工作流可能包含：OCR 识别模型 → 文本分类模型 → 摘要生成模型 → 关键信息提取模型。工作流的每个节点都是独立的 AI 代理，可以由不同的节点运营者提供，最终结算时按各节点的贡献比例分配 SNT 报酬。`,
    contentEn: `**Model Registration and Discovery**

Any developer or institution can register AI models (including LLMs, image generation models, speech recognition models, etc.) to Sentia's model marketplace. Registration requires submitting the model's capability description, performance benchmark results, pricing plan, and a stake of no less than 5,000 SNT. Models are identified on-chain by unique model IDs, and consumers can filter by tags, performance metrics, and pricing dimensions.

**Inference Verification Mechanism**

The core challenge of decentralized AI inference is: how to verify the correctness of results without re-executing the inference? Sentia adopts an "Optimistic Verification + Challenge Period" mechanism: inference results are accepted by default, but within a 24-hour challenge period, any validator who has staked SNT can challenge the results. Successful challenges reward the challenger and slash the model provider's stake; failed challenges result in the challenger losing their stake. This mechanism ensures efficiency while providing economic guarantees for result correctness.

**Model Composition and AI Workflows**

Sentia supports combining multiple AI models into Workflows, describing data flow relationships between models through Directed Acyclic Graphs (DAG). For example, a complete "Document Intelligence Analysis" workflow might include: OCR Recognition Model → Text Classification Model → Summary Generation Model → Key Information Extraction Model. Each node in the workflow is an independent AI agent that can be provided by different node operators, with SNT rewards distributed according to each node's contribution ratio at final settlement.`,
  },

  // ── 7. Token Economics ────────────────────────────────────────────────────
  {
    id: "tokenomics",
    num: "07",
    titleZh: "代币经济学",
    titleEn: "Token Economics",
    contentZh: `**SNT 代币的基本参数**

| 参数 | 数值 |
|------|------|
| 代币名称 | Sentia |
| 代币符号 | SNT |
| 底层网络 | BNB Chain (BEP-20) |
| 总供应量 | 1,000,000,000 SNT（固定，不可增发）|
| 小数位数 | 18 |
| 合约标准 | ERC-20 兼容 |

**代币分配方案**

| 分配类别 | 比例 | 数量 | 锁仓规则 |
|----------|------|------|----------|
| 合伙人私募 | 15% | 1.5 亿 | TGE 释放 10%，锁仓 3 个月后 12 个月线性释放 |
| 生态基金 | 25% | 2.5 亿 | 锁仓 6 个月，36 个月线性释放 |
| 团队与顾问 | 15% | 1.5 亿 | 锁仓 12 个月，24 个月线性释放 |
| 节点激励 | 20% | 2.0 亿 | 按挖矿周期逐步释放，持续 48 个月 |
| 流动性储备 | 10% | 1.0 亿 | TGE 时部分释放，用于交易所流动性 |
| 公开销售 | 10% | 1.0 亿 | TGE 时 30% 释放，剩余 6 个月线性释放 |
| 社区与空投 | 5% | 0.5 亿 | 按社区活动计划逐步释放 |

**SNT 的四重价值捕获机制**

*服务支付*：所有在 SAN 上执行的 AI 推理任务均以 SNT 计价，消费者支付的 SNT 中 90% 流向服务提供者，10% 进入协议国库（Treasury）。

*节点质押*：运行 SAN 节点需要质押 SNT，质押量决定节点的任务分配权重。质押的 SNT 处于锁定状态，节点退出时经过 7 天解锁期后返还。

*治理投票*：SNT 持有者可以参与协议参数调整、新功能提案、生态基金分配等治理决策，投票权重与持仓量成正比。

*通缩机制*：协议国库收取的 10% 服务费中，50% 用于定期回购并销毁 SNT，形成持续的通缩压力。随着网络使用量的增长，SNT 的流通供应量将持续减少。`,
    contentEn: `**Basic Parameters of SNT Token**

| Parameter | Value |
|-----------|-------|
| Token Name | Sentia |
| Token Symbol | SNT |
| Underlying Network | BNB Chain (BEP-20) |
| Total Supply | 1,000,000,000 SNT (Fixed, no additional issuance) |
| Decimal Places | 18 |
| Contract Standard | ERC-20 Compatible |

**Token Allocation Plan**

| Allocation Category | Percentage | Amount | Vesting Rules |
|--------------------|------------|--------|---------------|
| Partner Private Sale | 15% | 150M | 10% at TGE, 12-month linear release after 3-month lock |
| Ecosystem Fund | 25% | 250M | 6-month lock, 36-month linear release |
| Team & Advisors | 15% | 150M | 12-month lock, 24-month linear release |
| Node Incentives | 20% | 200M | Gradually released per mining cycle over 48 months |
| Liquidity Reserve | 10% | 100M | Partial release at TGE for exchange liquidity |
| Public Sale | 10% | 100M | 30% at TGE, remaining 6-month linear release |
| Community & Airdrop | 5% | 50M | Gradually released per community activity plan |

**SNT's Four-Fold Value Capture Mechanism**

*Service Payment*: All AI inference tasks executed on SAN are priced in SNT. Of the SNT paid by consumers, 90% flows to service providers and 10% enters the protocol Treasury.

*Node Staking*: Running SAN nodes requires staking SNT, with the staking amount determining the node's task allocation weight. Staked SNT is in a locked state and is returned after a 7-day unlock period when the node exits.

*Governance Voting*: SNT holders can participate in governance decisions including protocol parameter adjustments, new feature proposals, and ecosystem fund allocation, with voting weight proportional to holdings.

*Deflationary Mechanism*: Of the 10% service fee collected by the protocol Treasury, 50% is used for periodic buyback and destruction of SNT, creating continuous deflationary pressure. As network usage grows, the circulating supply of SNT will continuously decrease.`,
  },

  // ── 8. Governance ─────────────────────────────────────────────────────────
  {
    id: "governance",
    num: "08",
    titleZh: "去中心化治理",
    titleEn: "Decentralized Governance",
    contentZh: `**治理架构**

Sentia 采用双层治理架构：链上治理（On-chain Governance）负责处理协议参数调整、智能合约升级等技术性决策；链下治理（Off-chain Governance）通过 Snapshot 等工具处理生态方向、合作关系、营销预算等非技术性决策。

**提案流程**

任何持有不少于 100,000 SNT 的地址均可发起治理提案。提案需经过以下阶段：
1. 讨论期（7 天）：在社区论坛公开讨论，收集反馈
2. 投票期（5 天）：SNT 持有者按持仓量投票，需达到法定人数（总流通量的 5%）
3. 执行期（2 天）：提案通过后进入时间锁，2 天后自动执行

**紧急治理机制**

对于涉及安全漏洞或重大风险的紧急情况，协议设有由 7 名成员组成的安全委员会（Security Council），可以在不经过完整投票流程的情况下执行紧急暂停或参数修复。安全委员会成员由社区选举产生，任期 12 个月，可被社区罢免。`,
    contentEn: `**Governance Architecture**

Sentia adopts a two-layer governance architecture: On-chain Governance handles technical decisions such as protocol parameter adjustments and smart contract upgrades; Off-chain Governance handles non-technical decisions such as ecosystem direction, partnerships, and marketing budgets through tools like Snapshot.

**Proposal Process**

Any address holding no less than 100,000 SNT can initiate a governance proposal. Proposals must go through the following stages:
1. Discussion Period (7 days): Open discussion in community forums to collect feedback
2. Voting Period (5 days): SNT holders vote by holdings, requiring quorum (5% of total circulation)
3. Execution Period (2 days): After proposal passes, it enters a time lock and automatically executes after 2 days

**Emergency Governance Mechanism**

For emergencies involving security vulnerabilities or major risks, the protocol has a Security Council of 7 members who can execute emergency pauses or parameter fixes without going through the full voting process. Security Council members are elected by the community, serve 12-month terms, and can be recalled by the community.`,
  },

  // ── 9. Security ───────────────────────────────────────────────────────────
  {
    id: "security",
    num: "09",
    titleZh: "安全模型",
    titleEn: "Security Model",
    contentZh: `**智能合约安全**

Sentia 的所有核心智能合约将在主网上线前完成至少两轮独立的第三方安全审计，审计报告将完整公开。合约代码将托管于 GitHub，采用多签（Multisig）控制升级权限，升级操作需经过 48 小时时间锁。

**AI 结果的可信度保障**

AI 推理结果的不可篡改性通过以下机制保障：推理请求和结果的哈希值被记录在链上；验证节点通过随机抽样对结果进行独立验证；恶意行为者面临质押削减的经济惩罚。这三重机制共同构成了 AI 结果可信度的防护网。

**隐私保护**

RGE 中的社交图谱数据采用以下隐私保护措施：用户身份以匿名地址表示；原始关系数据经过加密存储；AI 代理只能通过 ZKP 接口访问脱敏后的聚合统计信息；用户可以随时撤销对特定代理的数据访问授权。

**预言机安全**

对于需要引入链外数据的场景（如 AI 模型性能基准、市场价格等），Sentia 采用 Chainlink 去中心化预言机网络，避免单点故障风险。`,
    contentEn: `**Smart Contract Security**

All core smart contracts of Sentia will complete at least two rounds of independent third-party security audits before mainnet launch, with audit reports fully disclosed. Contract code will be hosted on GitHub, with upgrade permissions controlled by multisig, and upgrade operations subject to a 48-hour time lock.

**Credibility Assurance for AI Results**

The immutability of AI inference results is guaranteed through the following mechanisms: hashes of inference requests and results are recorded on-chain; validation nodes independently verify results through random sampling; malicious actors face economic penalties of stake slashing. These three mechanisms together form the protection network for AI result credibility.

**Privacy Protection**

Social graph data in RGE adopts the following privacy protection measures: user identities are represented by anonymous addresses; raw relationship data is stored encrypted; AI agents can only access desensitized aggregated statistical information through the ZKP interface; users can revoke data access authorization for specific agents at any time.

**Oracle Security**

For scenarios requiring the introduction of off-chain data (such as AI model performance benchmarks, market prices, etc.), Sentia uses the Chainlink decentralized oracle network to avoid single-point-of-failure risks.`,
  },

  // ── 10. Roadmap ───────────────────────────────────────────────────────────
  {
    id: "roadmap",
    num: "10",
    titleZh: "发展路线图",
    titleEn: "Development Roadmap",
    contentZh: `**第一阶段：基础建设（2025 Q1-Q2）**
- 核心团队组建完成，技术白皮书发布
- 合伙人私募轮开启，目标募集 400 万 USDT
- SNT 智能合约部署至 BNB Chain 测试网
- SAN 节点软件 Alpha 版本发布
- 完成首轮智能合约安全审计

**第二阶段：主网上线（2025 Q2-Q3）**
- SNT 代币在币安（Binance）正式上线，预计 2025 年 6 月底
- SAN 主网启动，首批节点开始提供 AI 推理服务
- RGE 测试版上线，支持基础社交图谱数据上链
- 开发者 SDK 1.0 发布，开放第三方应用接入
- 完成第二轮安全审计

**第三阶段：生态扩张（2025 Q3-Q4）**
- AI 推理节点数量目标突破 1,000 个
- RGE 正式版上线，支持 ZKP 社交证明
- 首批第三方 DApp 接入 Sentia 协议
- DAO 治理框架正式启动
- 与主流 DeFi 协议完成集成

**第四阶段：全球化（2026）**
- 跨链桥接部署，支持以太坊、Solana 等主流公链
- AI 代理数量目标突破 10 万个
- 机构级 AI 服务套件发布
- 全球开发者社区建设，目标 10,000+ 活跃开发者`,
    contentEn: `**Phase 1: Foundation Building (2025 Q1-Q2)**
- Core team assembled, technical whitepaper released
- Partner private sale round opens, targeting $4M USDT raised
- SNT smart contract deployed to BNB Chain testnet
- SAN node software Alpha version released
- First round of smart contract security audit completed

**Phase 2: Mainnet Launch (2025 Q2-Q3)**
- SNT token officially listed on Binance, expected late June 2025
- SAN mainnet launched, first batch of nodes begin providing AI inference services
- RGE beta version launched, supporting basic social graph data on-chain
- Developer SDK 1.0 released, opening third-party application access
- Second round of security audit completed

**Phase 3: Ecosystem Expansion (2025 Q3-Q4)**
- AI inference node count target exceeds 1,000
- RGE official version launched, supporting ZKP social proofs
- First batch of third-party DApps integrated with Sentia protocol
- DAO governance framework officially launched
- Integration with mainstream DeFi protocols completed

**Phase 4: Globalization (2026)**
- Cross-chain bridge deployment supporting Ethereum, Solana, and other major public chains
- AI agent count target exceeds 100,000
- Institutional-grade AI service suite released
- Global developer community building, targeting 10,000+ active developers`,
  },

  // ── 11. Team ──────────────────────────────────────────────────────────────
  {
    id: "team",
    num: "11",
    titleZh: "团队与顾问",
    titleEn: "Team & Advisors",
    contentZh: `**核心团队**

Sentia 的核心团队由来自 AI 研究、区块链工程、产品设计和商业运营四个领域的专业人士组成，成员均有在顶级科技公司或知名区块链项目的工作经历。

团队在 AI 推理系统、分布式系统架构、智能合约开发以及社交网络分析等技术领域具有深厚积累。核心成员合计拥有超过 50 项 AI 与区块链相关专利，并在 NeurIPS、ICML、IEEE 等顶级学术会议发表过多篇研究论文。

**技术顾问**

Sentia 的技术顾问团队包括多位在去中心化 AI、零知识证明和社交图谱分析领域具有国际影响力的学者与工程师，他们为协议的技术路线提供独立的专业意见。

**生态合作伙伴**

Sentia 已与多家区块链基础设施提供商、AI 算力供应商和 Web3 应用开发团队建立战略合作关系，共同推动协议生态的早期建设。`,
    contentEn: `**Core Team**

Sentia's core team consists of professionals from four fields: AI research, blockchain engineering, product design, and business operations, all with work experience at top technology companies or well-known blockchain projects.

The team has deep expertise in AI inference systems, distributed system architecture, smart contract development, and social network analysis. Core members collectively hold more than 50 AI and blockchain-related patents and have published multiple research papers at top academic conferences including NeurIPS, ICML, and IEEE.

**Technical Advisors**

Sentia's technical advisory team includes multiple scholars and engineers with international influence in decentralized AI, zero-knowledge proofs, and social graph analysis, providing independent professional opinions on the protocol's technical roadmap.

**Ecosystem Partners**

Sentia has established strategic partnerships with multiple blockchain infrastructure providers, AI computing power suppliers, and Web3 application development teams to jointly promote the early development of the protocol ecosystem.`,
  },

  // ── 12. Risk Disclosure ───────────────────────────────────────────────────
  {
    id: "risk",
    num: "12",
    titleZh: "风险披露",
    titleEn: "Risk Disclosure",
    contentZh: `参与 Sentia 代币预售及持有 SNT 代币涉及重大风险，潜在参与者应在充分了解以下风险因素后审慎决策：

**技术风险**：区块链技术和 AI 系统仍处于快速发展阶段，Sentia 协议可能面临技术故障、安全漏洞或性能瓶颈。智能合约代码虽经过审计，但不能完全排除未知漏洞的存在。

**市场风险**：加密货币市场具有高度波动性，SNT 代币的市场价值可能大幅波动，甚至归零。过去的价格表现不代表未来收益。

**监管风险**：全球各地区对加密货币和区块链项目的监管政策存在不确定性，未来的监管变化可能对 Sentia 协议的运营产生重大影响。

**竞争风险**：AI 区块链赛道竞争激烈，包括资金更雄厚的竞争对手，可能影响 Sentia 的市场份额和代币价值。

**流动性风险**：SNT 代币在上线初期可能面临流动性不足的问题，这可能导致买卖价差扩大和价格波动加剧。

本白皮书不构成投资建议，参与者应根据自身的风险承受能力和财务状况做出独立判断。`,
    contentEn: `Participating in the Sentia token presale and holding SNT tokens involves significant risks. Potential participants should make prudent decisions after fully understanding the following risk factors:

**Technical Risk**: Blockchain technology and AI systems are still in rapid development stages. The Sentia protocol may face technical failures, security vulnerabilities, or performance bottlenecks. Although smart contract code has been audited, the existence of unknown vulnerabilities cannot be completely ruled out.

**Market Risk**: The cryptocurrency market is highly volatile, and the market value of SNT tokens may fluctuate significantly or even go to zero. Past price performance does not represent future returns.

**Regulatory Risk**: Regulatory policies for cryptocurrencies and blockchain projects vary across global regions with uncertainty. Future regulatory changes may have significant impacts on the operations of the Sentia protocol.

**Competition Risk**: The AI blockchain sector is highly competitive, including competitors with greater financial resources, which may affect Sentia's market share and token value.

**Liquidity Risk**: SNT tokens may face insufficient liquidity in the early stages after listing, which may lead to wider bid-ask spreads and increased price volatility.

This whitepaper does not constitute investment advice. Participants should make independent judgments based on their own risk tolerance and financial situation.`,
  },

  // ── 13. Legal ─────────────────────────────────────────────────────────────
  {
    id: "legal",
    num: "13",
    titleZh: "法律声明",
    titleEn: "Legal Disclaimer",
    contentZh: `本白皮书由 Sentia Protocol 团队发布，仅供信息参考目的，不构成任何形式的证券发行、投资邀约或财务建议。

本文件中的信息可能随时更新，Sentia Protocol 团队保留修改本白皮书内容的权利，恕不另行通知。最新版本将在官方网站发布。

SNT 代币是 Sentia 协议的功能性代币（Utility Token），用于支付协议内的服务费用、参与治理投票和节点质押。SNT 代币不代表对 Sentia Protocol 实体的任何所有权、股权或债权。

参与者应自行了解并遵守其所在司法管辖区关于加密货币的相关法律法规。Sentia Protocol 团队不对因参与本项目而产生的任何直接或间接损失承担责任。

© 2025 Sentia Protocol. All Rights Reserved.`,
    contentEn: `This whitepaper is published by the Sentia Protocol team for informational purposes only and does not constitute any form of securities issuance, investment solicitation, or financial advice.

The information in this document may be updated at any time. The Sentia Protocol team reserves the right to modify the content of this whitepaper without prior notice. The latest version will be published on the official website.

The SNT token is a functional utility token of the Sentia protocol, used to pay service fees within the protocol, participate in governance voting, and node staking. The SNT token does not represent any ownership, equity, or debt claims against the Sentia Protocol entity.

Participants should independently understand and comply with laws and regulations regarding cryptocurrencies in their jurisdictions. The Sentia Protocol team is not responsible for any direct or indirect losses arising from participation in this project.

© 2025 Sentia Protocol. All Rights Reserved.`,
  },
];

export const TABLE_OF_CONTENTS = SECTIONS.map(s => ({
  id: s.id,
  num: s.num,
  titleZh: s.titleZh,
  titleEn: s.titleEn,
}));
