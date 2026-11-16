# 別のお店に使うとき（汎用の手順）

`HANDOVER.md` は空調のホットライン（秋元さん）向けです。別のお店に渡すときは、こちらを使ってください。

## 直すところ（2か所だけ）
1. `config.js` の `SHOP`
   - name（店名）・city・areaLabel・address・siteUrl（公式サイト。無ければ ""）・yearUnits（無ければ ""）
   - phone・hours・lineUrl
   - prices（wall・autoAdd・bunkaiAdd）と areas（地域ごとの市区町村）
   - gasUrl は Google の設定のあとに入れる
2. `gas/Code.gs` の `STORE`
   - name（店名）・idPrefix（紹介者番号の頭の英字。例 K）・siteUrl（そのお店の公開URL。最後は /）

絵（img/）は同じ名前で上書きすれば差し替わります。質問コーナーの中身は `reserve/thanks-data.js`、紹介の契約書は `signup.html` の中にあります（どちらも、ありがとうエアコンの決まりのままなので、そのお店の決まりに合わせて確認してください）。

## 渡すプロンプト
**貼る場所：そのお店の方の Chrome の Claude（拡張機能）。GitHub と Google にログインした状態で、新しいタブで貼る**

```
<お店の名前>の広告LPと予約フォームを、私のGitHubで公開し、予約が私のGoogleに届くようにしてください。上から順に進めてください。

【A】雛形から自分のリポジトリを作る
1. https://github.com/miumiumiu4/kucho-lp を開き、緑の「Use this template」→「Create a new repository」。
2. Owner は私のアカウント、Repository name は <リポジトリ名>、Public を選んで「Create repository」。
   ※すでにある私のほかのリポジトリには触らないでください。

【B】GitHub Pages で公開する
3. できたリポジトリの Settings → Pages を開き、Source「Deploy from a branch」、Branch「main」「/(root)」で Save。
4. 数分待って公開URL（https://<私のユーザー名>.github.io/<リポジトリ名>/）を開き、トップと「かんたん予約」が表示されるか確認。

【C】お店の情報に直す
5. config.js を鉛筆マークで編集し、次に直して「Commit changes」。
   - name：<お店の名前> ／ city：<地域名> ／ areaLabel：<◯◯市・近郊 など> ／ address：<市区まで>
   - siteUrl：<公式サイトのURL。無ければ ""> ／ yearUnits：<年間の作業台数。無ければ "">
   - phone：<電話番号> ／ hours：<受付時間> ／ lineUrl：<LINE公式のURL。無ければ "">
   - prices：wall <通常タイプの料金>、autoAdd <お掃除機能付きの上乗せ>、bunkaiAdd <完全分解の上乗せ>
   - areas：<地域ごとの市区町村>

【D】予約の受け口をGoogleに作る
6. リポジトリの gas/Code.gs を開き、「Raw」で中身を全部コピー。
7. 新しいタブで https://script.new を開き、最初のコードを消して貼り付け。上の方の STORE を次に直して保存。
   - name：'<お店の名前>' ／ idPrefix：'<紹介者番号の頭の英字1〜2文字>' ／ siteUrl：'<【B】の公開URL（最後は /）>'
   プロジェクト名は「<お店の名前> 予約の受け口」。
8. 関数の選択で「setup」を選んで「実行」。
   「承認が必要です」が出たら、そこで止まって私に知らせてください（許可は私が自分で押します）。
   許可のあと、実行ログに出た「台帳」のURLを教えてください。
9. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」、実行するユーザー「自分」、アクセスできるユーザー「全員」でデプロイ。
   出てきた「ウェブアプリのURL」（…/exec で終わるもの）をコピー。
10. config.js の gasUrl: "" の "" の中にそのURLを入れて Commit。

【E】テスト
11. 2〜3分待ってから公開URLの「かんたん予約」で、名前「テスト」で1件送る。台帳に1行増え、私のGmailに「【新しい予約】」が届けば完了。
12. 公開URLの signup.html で、自分を紹介者として試しに登録し、メールが届くか確認（確認後、台帳の行は消してかまいません）。
13. 最後に、公開URLと台帳のURLを私に教えてください。

注意：パスワード・二段階認証・Googleの許可画面が出たら、そこで止まって私に知らせてください。
```
