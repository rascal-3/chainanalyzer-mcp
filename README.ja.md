# chainanalyzer-mcp

[ChainAnalyzer](https://chain-analyzer.com) の MCP Server -- AIエージェント向けマルチチェーンAML分析ツール。

**Bitcoin, Ethereum, Polygon, BNB Smart Chain, Base, Arbitrum, Optimism, Avalanche, Solana** の9チェーンに対応。制裁リスト照合、マネーロンダリングパターン検出、ラグプル検知、ウォレットドレイナー検出など、76以上の検知ルール、ML異常検知、Neo4jグラフ分析を提供します。

## ツール一覧

| ツール | 説明 | 料金 |
|--------|------|------|
| `check_address_risk` | ブロックチェーンアドレスのAMLリスクスコア | $0.008 |
| `sanctions_check` | OFAC / FATF / 金融庁 制裁リストスクリーニング | $0.003 |
| `trace_transaction` | ML異常検知付きトランザクションフロー追跡 | $0.015 |
| `detect_coinjoin` | CoinJoin / ミキシングパターン検出（Bitcoin） | $0.01 |
| `cluster_wallet` | Neo4jグラフによるウォレットクラスタリング | $0.02 |
| `batch_screening` | 一括AMLスクリーニング（最大50アドレス） | $0.05 |

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

[chain-analyzer.com](https://chain-analyzer.com) で `tfk_` APIキーを取得（Proプラン）。

```json
{
  "env": {
    "CHAINANALYZER_API_KEY": "tfk_your_api_key"
  }
}
```

### 2. x402 USDC決済（従量課金）

アカウント不要。BaseまたはSolana上のUSDCでリクエストごとに支払い。

```json
{
  "env": {
    "X402_PRIVATE_KEY": "your_wallet_private_key",
    "X402_NETWORK": "base"
  }
}
```

`x402` npmパッケージが必要: `npm install x402`

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
| `X402_NETWORK` | 決済ネットワーク: `base` または `solana`（デフォルト: `base`） | いいえ |
| `CHAINANALYZER_BASE_URL` | APIベースURL（デフォルト: `https://chain-analyzer.com`） | いいえ |

## 使用例

設定後、AIエージェントに以下のように指示できます:

> 「このEthereumアドレスが制裁対象か確認して: 0x1234...」

> 「このSolanaウォレットのリスクスコアを分析して: ABC123...」

> 「このBitcoinトランザクションの資金フローを追跡して、ミキシングパターンがないか確認して」

> 「これら20個のアドレスをAMLコンプライアンスチェックして」

エージェントが適切なChainAnalyzerツールを自動的に呼び出します。

## 対応チェーン

- **Bitcoin** -- OFAC照合、ダストアタック、Peel Chain、CoinJoin検出
- **Ethereum** -- 18以上の検知ルール、Neo4jグラフ分析、制裁・ミキサー検出
- **Polygon** -- EVM AMLフルスイート対応
- **Avalanche** -- EVM AMLフルスイート対応
- **Solana** -- トークンセキュリティ（ラグプル、ハニーポット）、ウォレットドレイナー検知

## リンク

- [ChainAnalyzer](https://chain-analyzer.com) -- Webプラットフォーム
- [ドキュメント](https://chain-analyzer.com/docs/api) -- APIリファレンス
- [x402プロトコル](https://x402.org) -- 従量課金プロトコル

## ライセンス

MIT - [LICENSE](LICENSE) を参照

---

[refinancier, inc.](https://chain-analyzer.com) が開発
