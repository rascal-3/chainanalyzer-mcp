# chainanalyzer-mcp

[ChainAnalyzer](https://chain-analyzer.com) の MCP Server -- AIエージェント向けマルチチェーンAML分析ツール。

**12 チェーン全プラン即時対応** — Bitcoin, Ethereum, Polygon, BNB Smart Chain, Base, Arbitrum, Optimism, Avalanche, Solana, Kaia, TRON, XRP。76 以上の検知ルール、ML 異常検知、Neo4j グラフ分析を提供します。

## ツール一覧

| ツール | 説明 | 料金 |
|--------|------|------|
| `check_address_risk` | ブロックチェーンアドレスのAMLリスクスコア(12チェーン) | $0.10 |
| `sanctions_check` | OFAC / FATF / 金融庁 制裁リストスクリーニング(12チェーン) | $0.05 |
| `hack_exposure_lookup` | 既知の流出事件(Binance 2026など)につながるか。事件ごとの判定・攻撃者からの段数・役割・金額の下限(EVM・TRON・Solana・Bitcoin) | $0.05 |
| `freeze_status` | ステーブルコイン(USDT・USDC・JPYCなど)を発行体が凍結しているか。トークンごとの状態と日時(Ethereum・Polygon・Avalanche・TRON) | $0.02 |
| `hack_exposure_batch` | 最大50アドレスをまとめて既知の流出事件と照合(入金アドレス一覧の審査) | $1.00 |
| `trace_transaction` | ML異常検知付きトランザクションフロー追跡(12チェーン) | $0.30 |
| `detect_coinjoin` | Bitcoinの取引IDを受け取り、取引の構造からCoinJoinかを判定。`is_coinjoin`・`mixer_type`・入力/出力の本数・同額の出力の組を返す | $0.10 |
| `cluster_wallet` | Neo4jグラフによるウォレットクラスタリング | $0.25 |
| `batch_screening` | 一括AMLスクリーニング(最大50アドレス・12チェーン) | $2.50 |
| `bridge_flow_trace` | クロスチェーン多段ブリッジ・フォレンジック追跡(Solver識別+同一インテント相関/NEAR Intents・Wormhole・Stargate等7プロトコル対応)。起点はEVMチェーンまたはSolana | $0.50 |

料金はx402モードでの1回あたりの価格(USDC・2026-11-16から)。最新の一覧は<https://chain-analyzer.com/x402/api/discover>。一括のツールは50アドレスまで1回の定額です。

## AIエージェント開発フレームワーク向けの例

LangChain・OpenAI Agents SDK・Vercel AI SDK・ElizaOSからそのまま使えるツール(x402の従量払い、またはAPIキー): [`examples/`](examples/)

## クイックスタート

### Claude Desktop / Claude Code

MCP設定に以下を追加:

```json
{
  "mcpServers": {
    "chainanalyzer-aml": {
      "command": "npx",
      "args": ["-y", "chainanalyzer-mcp"],
      "env": {
        "CHAINANALYZER_API_KEY": "tfk_your_api_key"
      }
    }
  }
}
```

### ソースから実行

```bash
git clone https://github.com/rascal-3/chainanalyzer-mcp.git
cd chainanalyzer-mcp
npm install
npm start
```

## 認証方式

3つのモードから選択できます。

### 1. APIキー（サブスクリプション）

[chain-analyzer.com](https://chain-analyzer.com/login?utm_source=github) にサインアップし、アカウント → 設定 → API Keysで`tfk_`APIキーを作成。Freeプランを含む全プランでキーを発行でき、Freeプランは月10スキャンまで無料で、制裁照合・リスク判定・トランザクション追跡・CoinJoin検出・ウォレットクラスタリングを試せます。APIキーモードでは`batch_screening`はStarter以上、`bridge_flow_trace`はBusiness以上が必要です（x402モードにプラン制限はありません）。レート制限はFree 10/分・Starter 30/分・Pro 60/分・Business 120/分・Enterprise 300/分。

```json
{
  "env": {
    "CHAINANALYZER_API_KEY": "tfk_your_api_key"
  }
}
```

### 2. x402 USDC決済（従量課金）

アカウント不要。このMCPサーバーはBase上のUSDCでリクエストごとに支払います(ChainAnalyzerのx402 APIは、402の応答でSolanaを案内しているときSolana上のUSDCでも受け付けますが、Solanaで払うにはSolanaに対応したx402クライアントが必要で、このサーバーは対応していません)。

```json
{
  "env": {
    "X402_PRIVATE_KEY": "your_wallet_private_key",
    "X402_NETWORK": "base"
  }
}
```

`x402` npmパッケージが必要: `npm install x402`

> **EIP-7702の委任が無いアドレスの鍵を使ってください。**支払い元のアドレスにEIP-7702の委任(スマートアカウント化)が付いていると、Base上のUSDCの署名の確認が通らず、支払いが失敗することがあります。

### 3. 開発モード

認証なし。ChainAnalyzerサーバーで `X402_ENABLED=false` の場合に動作。

```json
{
  "env": {
    "CHAINANALYZER_BASE_URL": "http://localhost:3000"
  }
}
```

## 環境変数

| 変数 | 説明 | 必須 |
|------|------|------|
| `CHAINANALYZER_API_KEY` | `tfk_` APIキー（サブスクリプション認証） | APIキーまたはx402のいずれか |
| `X402_PRIVATE_KEY` | USDC決済用ウォレット秘密鍵 | APIキーまたはx402のいずれか |
| `X402_NETWORK` | 決済ネットワーク(デフォルト: `base`)。このサーバーの支払いは`base`のみ | いいえ |
| `CHAINANALYZER_BASE_URL` | APIベースURL（デフォルト: `https://chain-analyzer.com`） | いいえ |

## 使用例

設定後、AIエージェントに以下のように指示できます:

> 「このEthereumアドレスが制裁対象か確認して: 0x1234...」

> 「このSolanaウォレットのリスクスコアを分析して: ABC123...」

> 「このBitcoinトランザクションの資金フローを追跡して、ミキシングパターンがないか確認して」

> 「これら20個のアドレスをAMLコンプライアンスチェックして」

エージェントが適切なChainAnalyzerツールを自動的に呼び出します。

## 対応チェーン

12チェーンすべてがセルフサーブプランで利用可能です。

| チェーン | 特徴 |
|---------|------|
| Bitcoin | OFAC照合、ダストアタック、Peel Chain、CoinJoin検出 |
| Ethereum | 18以上の検知ルール、Neo4jグラフ分析、制裁・ミキサー検出 |
| Polygon / BNB Smart Chain / Base / Arbitrum / Optimism / Avalanche / Kaia | EVM AMLフルスイート、ブリッジ追跡 |
| Solana | トークンセキュリティ（ラグプル、ハニーポット）、ウォレットドレイナー検知、ブリッジ追跡 |
| TRON | USDTフロー照合、制裁照合（独立スキャナ） |
| XRP | 取引所・発行体ラベル、制裁照合（独立スキャナ） |

`bridge_flow_trace`の起点はEVMチェーン(Kaiaを含む)またはSolana、`detect_coinjoin`はBitcoinのみ対応です。`freeze_status`はEthereum・Polygon・Avalanche・TRON、`hack_exposure_lookup`/`hack_exposure_batch`はEVMチェーン・TRON・Solana・Bitcoinが対象です。

## リンク

- [ChainAnalyzer](https://chain-analyzer.com) -- Webプラットフォーム
- [ドキュメント](https://chain-analyzer.com/docs/api) -- APIリファレンス
- [x402プロトコル](https://x402.org) -- 従量課金プロトコル

## ライセンス

MIT - [LICENSE](LICENSE) を参照

---

[refinancier, inc.](https://chain-analyzer.com) が開発
