# 空調のホットライン 広告LP 引き継ぎ手順（秋元さん用）

このリポジトリは「雛形」です。下のプロンプトを Chrome の Claude（拡張機能）に1回貼るだけで、
秋元さんのGitHubに複製・公開され、予約が秋元さんのGoogleに届くようになります。

- `index.html` … 絵中心の広告LP
- `reserve/index.html` … 会話型の予約フォーム
- `config.js` … 電話番号・LINE・料金・エリア・予約の受け口URL（直すのはここだけ）
- `gas/Code.gs` … 予約の受け口（Googleに置くプログラム）
- `img/` … 画像（実際の作業写真に差し替えるとさらに良い）

**貼る場所：Chrome の Claude（拡張機能）。GitHub と Google にログインした状態で、新しいタブで貼る**

```
空調のホットラインの広告LPと予約フォームを、私のGitHubで公開し、予約が私のGoogleに届くようにしてください。上から順に進めてください。

【A】雛形から自分のリポジトリを作る
1. https://github.com/miumiumiu4/kucho-lp を開き、緑の「Use this template」→「Create a new repository」。
2. Owner は私のアカウント、Repository name は kucho-lp、Public を選んで「Create repository」。
   ※すでにある kucho-hotline-site・kucho-booking・nekobe には触らないでください。

【B】GitHub Pages で公開する
3. できた kucho-lp の Settings → Pages を開き、Source「Deploy from a branch」、Branch「main」「/(root)」で Save。
4. 数分待って公開URL（https://<私のユーザー名>.github.io/kucho-lp/）を開き、トップと「かんたん予約」が表示されるか確認。

【C】予約の受け口をGoogleに作る
5. kucho-lp の gas/Code.gs を開き、「Raw」で中身を全部コピー。
6. 新しいタブで https://script.new を開き、最初のコードを消して貼り付け、プロジェクト名を「空調のホットライン 予約の受け口」にして保存。
7. 関数の選択で「setup」を選んで「実行」。
   「承認が必要です」が出たら、そこで止まって私に知らせてください（許可は私が自分で押します）。
   許可のあと、実行ログに出た「予約台帳」のURLを教えてください。
8. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」、実行するユーザー「自分」、アクセスできるユーザー「全員」でデプロイ。
   出てきた「ウェブアプリのURL」（…/exec で終わるもの）をコピー。

【D】フォームと受け口をつなぐ
9. GitHub の kucho-lp の config.js を開いて鉛筆マークで編集し、次を直して「Commit changes」。
   - gasUrl: "" の "" の中に、8でコピーしたURLを入れる
   - phone：お店の電話番号（いまは 090-4143-4127）で合っているか
   - lineUrl：LINE公式アカウントのURL（無ければ "" のまま）

【E】テスト
10. 2〜3分待ってから公開URLの「かんたん予約」を開き、名前を「テスト」にして1件送る。
11. 予約台帳に1行増え、私のGmailに「【新しい予約】」のメールが届けば完了。テストの行は消してかまいません。
12. 最後に、公開URLと予約台帳のURLを私に教えてください。

注意：パスワード・二段階認証・Googleの許可画面が出たら、そこで止まって私に知らせてください。
```

## 困ったとき
- 予約が届かない：config.js の gasUrl が …/exec で終わっているか確認。Code.gs を直したら「デプロイを管理」→ 鉛筆 →「新バージョン」で出し直す（「新しいデプロイ」を作るとURLが変わるので注意）。
- 写真を変えたい：img/ の同じ名前のファイルを上書きアップロードするだけ。
