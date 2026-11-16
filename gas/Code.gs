/**
 * 予約の受け口 ＋ 紹介ノート（Google Apps Script・お店の Google アカウントに1つ置く）
 *
 * できること
 *  - 予約ページから届いた予約を「予約」シートに1行ずつためて、お店にメールで知らせる
 *  - 紹介者の登録（signup.html）を「紹介者」シートに入れ、お礼のメールを送る
 *  - 紹介コードつきの予約を「紹介」シートに入れる。お店が「お支払い」を「支払済」にすると、毎朝の点検で紹介料（20%）が確定し、紹介者にお知らせ
 *  - 毎月1日に先月分を締めて「振込」シートに振込リストを作り、お店にメール。振り込んだら「状態」を「振込済」に → 翌朝、紹介者にお知らせ
 *
 * はじめの1回だけ（Apps Script のエディタで）
 *  1. 関数 setup を実行（許可画面が出たら、お店の人が許可）→ 台帳のスプレッドシートと毎日・毎月の時計ができる
 *  2. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」／実行するユーザー：自分／アクセスできるユーザー：全員
 *  3. 出てきた URL（…/exec）を config.js の gasUrl に入れる
 *
 * 決まり（ありがとうエアコンの紹介ノートと同じ）
 *  - 率は一律 20%（通常価格合計の20%）。紹介者を紹介した人へのお返しは 2%（1段だけ・登録から1年）
 *  - 登録は無料・購入を条件にしない。有料の加入は作らない
 *  - 「支払済」で確定。本人・同じ住所は対象外。取消は対象外
 *  - 月末締め・翌月15日振込（土日は次の月曜日）。振込先が未登録の人の分は次の月へ回す
 */

var STORE = {
  name: '空調のホットライン',
  idPrefix: 'K',      // 紹介者番号は K-A0001 の形
  siteUrl: 'https://miumiumiu4.github.io/kucho-lp/' // 公開ページのURL（最後は / ）。複製したら自分のURLに直す
};
var AFF_RATE = 0.20, AFF_UPLINE_RATE = 0.02, AFF_UPLINE_DAYS = 365, PAY_DAY = 15;
var CONTRACT_VERSION = '2026-11-16 案（ありがとう紹介ノート 2026-10-17 案を元に、同意チェック式にしたもの）';

var SHEETS = {
  '予約': ['受付番号', '受付日時', 'お名前', '電話番号', 'メール', '地域', 'ご住所', 'お住まい', '台数', '概算（円）', '第1希望', '第2希望', '駐車場', 'メーカー・型番', 'ご要望', '流入元', '紹介コード'],
  '紹介者': ['紹介者番号', '種類', '状態', 'お名前', 'メール', '発信する場所', '紹介してくれた紹介者番号', '元の受付番号', '契約に同意した日時', '契約の版', '登録日', 'メモ'],
  '紹介': ['受付番号', '紹介コード', '通常価格合計（税込）', 'お支払い', '判定', '紹介料', '支払済の日', 'お知らせした日', '締め月', 'お返しの相手', 'お返し(2%)', 'お返しの締め月', '振込済', 'メモ'],
  '振込': ['締め月', '紹介者番号', '件数', '紹介者の紹介の件数', '紹介料', '状態', '振込日(予定)', '振り込んだ日', '振込のお知らせ', '対象の受付番号'],
  '振込先': ['紹介者番号', 'メール', '銀行名', '支店名', '口座の種類', '口座番号', '口座名義（カナ）', '登録日']
};
var JUDGE = { WAIT: '待ち（お支払い前）', OK: '確定', CANCEL: '取消', SELF: '対象外（本人）', SAME_ADDR: '対象外（同じ住所）', UNKNOWN: '紹介番号不明', STOPPED: '対象外（紹介者が停止中）', NO_PRICE: '要設定（通常価格なし）' };

/* ---------- はじめの1回 ---------- */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  if (props.getProperty('SHEET_ID')) ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  else { ss = SpreadsheetApp.create(STORE.name + ' 予約台帳・紹介ノート'); props.setProperty('SHEET_ID', ss.getId()); }
  Object.keys(SHEETS).forEach(function (name, i) {
    var sh = ss.getSheetByName(name) || (i === 0 && /^(シート1|Sheet1)$/.test(ss.getSheets()[0].getName()) ? ss.getSheets()[0].setName(name) : ss.insertSheet(name));
    // 前の版の見出しのシートがあれば「（旧）」に名前を変えて残し、新しく作る（前の版から乗りかえるとき）
    if (sh.getLastRow() > 0 && sh.getRange(1, 1, 1, SHEETS[name].length).getValues()[0].join('|') !== SHEETS[name].join('|')) {
      sh.setName(name + '（旧）');
      sh = ss.insertSheet(name);
    }
    if (sh.getLastRow() === 0) { sh.appendRow(SHEETS[name]); sh.setFrozenRows(1); }
  });
  // 選べる値
  var dv = function (name, col, list) {
    ss.getSheetByName(name).getRange(2, col, 1000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build());
  };
  dv('紹介', 4, ['', '支払済', '取消']);
  dv('紹介者', 3, ['有効', '承認待ち', '停止']);
  dv('振込', 6, ['振込待ち', '振込先待ち', '振込済']);
  // 時計：毎朝7時に点検、毎月1日8時に先月の締め
  ScriptApp.getProjectTriggers().forEach(function (t) { if (/^(dailyCheck|monthlyClose)$/.test(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyCheck').timeBased().atHour(7).everyDays(1).inTimezone('Asia/Tokyo').create();
  ScriptApp.newTrigger('monthlyClose').timeBased().onMonthDay(1).atHour(8).inTimezone('Asia/Tokyo').create();
  Logger.log('台帳：' + ss.getUrl());
}

/* ---------- 共通 ---------- */
function ss_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')); }
function owner_() { return Session.getEffectiveUser().getEmail(); }
function today_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'); }
function clip_(v, n) { var s = String(v == null ? '' : v).slice(0, n || 300); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function norm_(v) { return String(v == null ? '' : v).normalize('NFKC').trim().toUpperCase(); }
function mail_(s) { return String(s || '').trim().toLowerCase(); }
function tel_(s) { return String(s || '').normalize('NFKC').replace(/\D/g, ''); }
function addr_(s) { return String(s || '').normalize('NFKC').replace(/[\s,、。・]/g, '').replace(/[‐‑‒–—―ーｰ－]/g, '-').replace(/(丁目|番地|番|号)/g, '-').replace(/-+/g, '-').replace(/-$/, ''); }
function yen_(v) { var n = Number(String(v == null ? '' : v).replace(/[,円\s]/g, '')); return isFinite(n) ? n : 0; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function send_(to, subject, body) { if (!to) return false; try { MailApp.sendEmail(String(to), subject, body + '\n\n' + STORE.name); return true; } catch (e) { return false; } }

/** シートを「見出し → 値」の形で読む。_row は行番号 */
function read_(name) {
  var sh = ss_().getSheetByName(name), h = SHEETS[name];
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues().map(function (r, i) {
    var o = { _row: i + 2 }; h.forEach(function (k, j) { o[k] = r[j] instanceof Date ? Utilities.formatDate(r[j], 'Asia/Tokyo', 'yyyy-MM-dd') : r[j]; }); return o;
  });
}
function append_(name, obj) { ss_().getSheetByName(name).appendRow(SHEETS[name].map(function (k) { return obj[k] == null ? '' : obj[k]; })); }
function update_(name, row, patch) {
  var sh = ss_().getSheetByName(name), h = SHEETS[name];
  Object.keys(patch).forEach(function (k) { var c = h.indexOf(k); if (c >= 0) sh.getRange(row, c + 1).setValue(patch[k]); });
}

/* ---------- 受け口 ---------- */
function doGet() { return json_({ ok: true }); }
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.kind === 'signup') return json_(signup_(d));
    if (d.kind === 'bank') return json_(bank_(d));
    return json_(booking_(d));
  } catch (err) {
    return json_({ ok: false, reason: '受け付けできませんでした。お電話でお知らせください。' });
  } finally { lock.releaseLock(); }
}

/** 予約 */
function booking_(d) {
  if (!d.name || !d.phone) return { ok: false, reason: 'お名前と電話番号を入れてください' };
  var sh = ss_().getSheetByName('予約');
  var id = 'R' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MMdd') + '-' + (sh.getLastRow() + 1);
  var ref = norm_(d.ref_code).slice(0, 30);
  var row = { '受付番号': id, '受付日時': now_(), 'お名前': clip_(d.name, 60), '電話番号': clip_(d.phone, 20), 'メール': clip_(d.email, 120), '地域': clip_(d.area, 40),
    'ご住所': clip_(d.address), 'お住まい': clip_(d.housing, 30), '台数': clip_(d.units, 120), '概算（円）': yen_(d.estimate) || '',
    '第1希望': clip_(d.date1, 20) + ' ' + clip_(d.time1, 20), '第2希望': d.date2 ? clip_(d.date2, 20) + ' ' + clip_(d.time2, 20) : '',
    '駐車場': clip_(d.parking, 40), 'メーカー・型番': clip_(d.model, 80), 'ご要望': clip_(d.note, 1000), '流入元': clip_(d.from, 300), '紹介コード': ref };
  append_('予約', row);
  if (ref) append_('紹介', { '受付番号': id, '紹介コード': ref, '通常価格合計（税込）': yen_(d.estimate) || '' });
  var body = SHEETS['予約'].map(function (k) { return k + '：' + row[k]; }).join('\n') + '\n\n台帳：' + ss_().getUrl()
    + (ref ? '\n\n※紹介コードつきの予約です。作業とお支払いが済んだら「紹介」シートの「お支払い」を「支払済」にしてください（取消のときは「取消」）。' : '');
  MailApp.sendEmail(owner_(), '【新しい予約】' + id + ' ' + row['お名前'] + ' 様（' + row['地域'] + '）', body);
  return { ok: true, id: id };
}

/** 紹介者の登録（登録ページから。だれでも送れる窓口なので中身を厳しく確かめる） */
function signup_(d) {
  if (String(d.website || '') !== '') return { ok: true }; // 機械の送信よけ（人には見えない欄）
  var name = String(d.name || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 40 || /[<>=@\t\r\n]/.test(name)) return { ok: false, reason: 'お名前を確かめてください（40文字まで）' };
  var email = mail_(d.email);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 120) return { ok: false, reason: 'メールアドレスを確かめてください' };
  var kind = String(d.kindOf || '');
  if (['お客様', '知り合い', '外部'].indexOf(kind) < 0) return { ok: false, reason: 'あてはまるものを選んでください' };
  var media = String(d.media || '').trim();
  if (kind === '外部' && !/^https:\/\/[^\s<>"]{4,300}$/.test(media)) return { ok: false, reason: '発信している場所（https で始まるURL）を入れてください' };
  if (d.agree !== true) return { ok: false, reason: '契約書の内容に同意のチェックを入れてください' };
  var list = read_('紹介者');
  if (list.filter(function (r) { return String(r['登録日']).slice(0, 10) === today_(); }).length >= 50) return { ok: false, reason: '本日の受付がいっぱいです。明日もう一度お試しください' };
  var same = list.filter(function (r) { return mail_(r['メール']) === email && String(r['状態']) !== '停止'; })[0];
  if (same) { send_(email, '【' + STORE.name + '】紹介者番号のご案内', name + ' 様\n\nすでにご登録があります。あなたの紹介者番号は ' + same['紹介者番号'] + ' です。'); return { ok: true, id: '', again: true }; }
  var pre = STORE.idPrefix + '-A', max = 0;
  list.forEach(function (r) { var s = norm_(r['紹介者番号']); if (s.indexOf(pre) === 0) max = Math.max(max, Number(s.slice(pre.length)) || 0); });
  var id = pre + ('000' + (max + 1)).slice(-4);
  var up = norm_(d.introducedBy), upOk = list.some(function (r) { return norm_(r['紹介者番号']) === up && String(r['状態']) === '有効'; });
  var from = norm_(d.fromJobId);
  append_('紹介者', { '紹介者番号': id, '種類': kind, '状態': kind === '外部' ? '承認待ち' : '有効', 'お名前': clip_(name, 40), 'メール': email, '発信する場所': clip_(media, 300),
    '紹介してくれた紹介者番号': upOk ? up : '', '元の受付番号': /^R\d{4}-\d+$/.test(from) ? from : '', '契約に同意した日時': now_(), '契約の版': CONTRACT_VERSION, '登録日': today_(), 'メモ': '登録ページから' });
  var link = linkBase_();
  send_(email, '【' + STORE.name + '】紹介者のご登録ありがとうございます', [name + ' 様', '',
    'ご登録ありがとうございます。あなたの紹介者番号は ' + id + ' です。',
    kind === '外部' ? '発信している場所を確認してから有効にします。有効になったらメールでお知らせします。' : '',
    '', 'あなたの紹介リンク：' + link + '?ref=' + id,
    'このリンクから予約した方の作業とお支払いが終わると、通常価格の20%を紹介料としてお振り込みします（月末締め・翌月15日）。',
    'SNS などに載せるときは「PR」と書いてください。', '',
    'お振り込み先の登録はこちら：' + link + 'signup.html?bank=' + id, '',
    '※同意いただいた契約書（版：' + CONTRACT_VERSION + '）は、登録ページでいつでも読めます。'].filter(function (x) { return x !== null; }).join('\n'));
  send_(owner_(), '【紹介ノート】新しい紹介者 ' + id + '（' + kind + '）', name + ' 様が登録しました。' + (kind === '外部' ? '\n外部の方です。発信の場所を見て、問題なければ「紹介者」シートの状態を「有効」にしてください：' + media : ''));
  return { ok: true, id: id };
}

/** 振込先の登録（番号とメールが合うときだけ） */
function bank_(d) {
  var id = norm_(d.id), email = mail_(d.email);
  var who = read_('紹介者').filter(function (r) { return norm_(r['紹介者番号']) === id && mail_(r['メール']) === email; })[0];
  if (!who) return { ok: false, reason: '紹介者番号とメールアドレスの組み合わせが見つかりません' };
  if (!d.bankName || !d.branch || !/^\d{6,8}$/.test(String(d.account || '').normalize('NFKC')) || !d.holder) return { ok: false, reason: '振込先をすべて入れてください（口座番号は数字6〜8けた）' };
  var cur = read_('振込先').filter(function (r) { return norm_(r['紹介者番号']) === id; })[0];
  var row = { '紹介者番号': id, 'メール': email, '銀行名': clip_(d.bankName, 40), '支店名': clip_(d.branch, 40), '口座の種類': clip_(d.type || '普通', 10), '口座番号': "'" + String(d.account).normalize('NFKC'), '口座名義（カナ）': clip_(d.holder, 60), '登録日': today_() };
  if (cur) update_('振込先', cur._row, row); else append_('振込先', row);
  send_(email, '【' + STORE.name + '】お振り込み先を登録しました', (who['お名前'] || '') + ' 様\n\nお振り込み先を登録しました。紹介料は月末締め・翌月15日にお振り込みします。');
  return { ok: true };
}
function linkBase_() { return STORE.siteUrl; }

/* ---------- 判定 ---------- */
function referrers_() {
  var map = {}, bookings = {};
  read_('予約').forEach(function (b) { bookings[norm_(b['受付番号'])] = b; });
  read_('紹介者').forEach(function (r) {
    var id = norm_(r['紹介者番号']); if (!id) return;
    var from = bookings[norm_(r['元の受付番号'])];
    var w = { id: id, active: String(r['状態']) === '有効', email: r['メール'], name: r['お名前'], introducedBy: norm_(r['紹介してくれた紹介者番号']), createdAt: String(r['登録日']).slice(0, 10),
      mails: [mail_(r['メール'])].concat(from ? [mail_(from['メール'])] : []).filter(Boolean), tels: from ? [tel_(from['電話番号'])] : [], addrs: from ? [addr_(from['ご住所'])] : [] };
    map[id] = w;
    if (from && !map[norm_(r['元の受付番号'])]) map[norm_(r['元の受付番号'])] = w; // お客様の紹介コード（受付番号）でも見つかる
  });
  return { map: map, bookings: bookings };
}
function judge_(ref, w, b) {
  var code = norm_(ref['紹介コード']);
  if (!code || !w) return JUDGE.UNKNOWN;
  if (norm_(ref['受付番号']) === code) return JUDGE.SELF;
  if (!w.active) return JUDGE.STOPPED;
  if (b && ((mail_(b['メール']) && w.mails.indexOf(mail_(b['メール'])) >= 0) || (tel_(b['電話番号']).length >= 10 && w.tels.indexOf(tel_(b['電話番号'])) >= 0))) return JUDGE.SELF;
  if (b && addr_(b['ご住所']) && w.addrs.indexOf(addr_(b['ご住所'])) >= 0) return JUDGE.SAME_ADDR;
  if (ref['お支払い'] === '取消') return JUDGE.CANCEL;
  if (ref['お支払い'] !== '支払済') return JUDGE.WAIT;
  return yen_(ref['通常価格合計（税込）']) > 0 ? JUDGE.OK : JUDGE.NO_PRICE;
}
function hasBank_() { var o = {}; read_('振込先').forEach(function (r) { o[norm_(r['紹介者番号'])] = true; }); return o; }

/** 毎朝：判定 → 確定のお知らせ → 振込済のお知らせ */
function dailyCheck() {
  var R = referrers_(), banks = hasBank_(), base = linkBase_();
  read_('紹介').forEach(function (r) {
    var w = R.map[norm_(r['紹介コード'])] || null, j = judge_(r, w, R.bookings[norm_(r['受付番号'])]);
    var fee = j === JUDGE.OK ? (r['締め月'] ? r['紹介料'] : Math.round(yen_(r['通常価格合計（税込）']) * AFF_RATE)) : 0;
    var patch = {};
    if (j !== r['判定']) patch['判定'] = j;
    if (String(fee) !== String(r['紹介料'])) patch['紹介料'] = fee;
    if (r['お支払い'] === '支払済' && !r['支払済の日']) patch['支払済の日'] = today_();
    if (j === JUDGE.OK && !r['お知らせした日'] && w && w.email) {
      var ok = send_(w.email, '【紹介料のお知らせ】ご紹介ありがとうございます', [(w.name || '') + ' 様', '',
        'ご紹介いただいた方のエアコンクリーニングが終わり、お支払いも完了しました。ありがとうございます。', '',
        '紹介料：' + Number(fee).toLocaleString('ja-JP') + '円（確定）',
        'お振り込み：月末で締めて、翌月' + PAY_DAY + '日にお振り込みします（土曜・日曜の場合は次の月曜日）。', '',
        banks[w.id] ? 'お振り込み先はご登録済みです。' : 'お振り込み先がまだご登録されていません。こちらからご登録ください。\n' + base + 'signup.html?bank=' + w.id, '',
        '※ご紹介した方のお名前などは、個人情報のためお知らせしていません。',
        '※紹介料は雑所得です。会社員の方は、ほかの所得と合わせて年20万円以下なら確定申告はいりません（住民税は別）。'].join('\n'));
      if (ok) patch['お知らせした日'] = today_();
    }
    if (Object.keys(patch).length) update_('紹介', r._row, patch);
  });
  // 振込済のお知らせ
  read_('振込').forEach(function (p) {
    if (String(p['状態']) !== '振込済' || p['振込のお知らせ']) return;
    var w = R.map[norm_(p['紹介者番号'])];
    if (w && send_(w.email, '【紹介料をお振り込みしました】', (w.name || '') + ' 様\n\n紹介料 ' + Number(p['紹介料']).toLocaleString('ja-JP') + '円（' + p['件数'] + '件分' + (Number(p['紹介者の紹介の件数']) ? '・ご紹介いただいた紹介者さんの分 ' + p['紹介者の紹介の件数'] + '件' : '') + '）を、ご登録の口座にお振り込みしました。ありがとうございました。'))
      update_('振込', p._row, { '振込のお知らせ': today_(), '振り込んだ日': p['振り込んだ日'] || today_() });
    var ids = String(p['対象の受付番号'] || '').split(/\s+/).map(function (x) { return x.replace(/\(.*\)$/, ''); });
    read_('紹介').forEach(function (r) { if (ids.indexOf(norm_(r['受付番号'])) >= 0 && !r['振込済']) update_('紹介', r._row, { '振込済': '済' }); });
  });
}

/* ---------- 月の締め ---------- */
function prevMonth_(ymd) { var y = +ymd.slice(0, 4), m = +ymd.slice(5, 7) - 1; if (!m) { y--; m = 12; } return y + '-' + ('0' + m).slice(-2); }
function payDay_(month) {
  var d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), PAY_DAY));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function uplineOf_(r, w, map) {
  if (!w || !w.introducedBy) return '';
  var up = map[w.introducedBy];
  if (!up || !up.active || up.id === w.id) return '';
  var from = w.createdAt, paid = String(r['支払済の日']).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(paid)) return '';
  var days = (new Date(paid) - new Date(from)) / 864e5;
  return days >= 0 && days < AFF_UPLINE_DAYS ? up.id : '';
}
function monthlyClose() { return closeMonth_(prevMonth_(today_())); }
function closeMonth_(month) {
  dailyCheck();
  var R = referrers_(), banks = hasBank_(), groups = {};
  var add = function (code, item) { (groups[code] = groups[code] || []).push(item); };
  read_('紹介').forEach(function (r) {
    if (r['判定'] !== JUDGE.OK) return;
    var pm = String(r['支払済の日']).slice(0, 7);
    if (!pm || pm > month) return;
    var w = R.map[norm_(r['紹介コード'])]; if (!w) return;
    if (!r['締め月']) add(w.id, { r: r, up: false, fee: Math.round(yen_(r['通常価格合計（税込）']) * AFF_RATE) });
    var up = uplineOf_(r, w, R.map);
    if (up && !r['お返しの締め月']) add(up, { r: r, up: true, fee: Math.round(yen_(r['通常価格合計（税込）']) * AFF_UPLINE_RATE) });
  });
  var done = read_('振込').filter(function (p) { return p['締め月'] === month; }).map(function (p) { return norm_(p['紹介者番号']); });
  var total = 0, count = 0, waiting = 0;
  Object.keys(groups).sort().forEach(function (code) {
    if (done.indexOf(code) >= 0) return;
    var list = groups[code], fee = list.reduce(function (a, x) { return a + x.fee; }, 0), ready = !!banks[code];
    if (!ready) { waiting++; return; } // 振込先が未登録の分は締めずに次の月へ
    append_('振込', { '締め月': month, '紹介者番号': code, '件数': list.filter(function (x) { return !x.up; }).length, '紹介者の紹介の件数': list.filter(function (x) { return x.up; }).length,
      '紹介料': fee, '状態': '振込待ち', '振込日(予定)': payDay_(month), '対象の受付番号': list.map(function (x) { return norm_(x.r['受付番号']) + (x.up ? '(紹介者の紹介)' : ''); }).join(' ') });
    list.forEach(function (x) { update_('紹介', x.r._row, x.up ? { 'お返しの締め月': month, 'お返しの相手': code, 'お返し(2%)': x.fee } : { '締め月': month, '紹介料': x.fee }); });
    total += fee; count++;
  });
  MailApp.sendEmail(owner_(), '【紹介料】' + month + ' 分の振込リスト（' + total.toLocaleString('ja-JP') + '円）', [
    '「振込」シートに振込リストを作りました。', '振込待ち：' + count + '人・' + total.toLocaleString('ja-JP') + '円', '振込先待ち：' + waiting + '人（登録されたら翌月に回します）', '',
    '振り込んだら「状態」を「振込済」にしてください。翌朝、紹介した方にお知らせが届きます。口座は「振込先」シートで見てください。', '', ss_().getUrl()].join('\n'));
  return { count: count, total: total, waiting: waiting };
}

/* ---------- 台帳のメニュー（スプレッドシートから手で動かすとき） ---------- */
function menuCheckNow() { dailyCheck(); }
function menuCloseLastMonth() { closeMonth_(prevMonth_(today_())); }
