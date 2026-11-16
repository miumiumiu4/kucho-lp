/**
 * 空調のホットライン 予約の受け口（Google Apps Script）
 * - 予約ページから届いた内容を、スプレッドシート「予約台帳」に1行ずつためる
 * - 届いたら、このスクリプトの持ち主のGmailに通知メールを送る
 *
 * 使い方
 * 1. https://script.new を開き、このファイルの中身を全部貼る
 * 2. 関数 setup を1回実行（許可画面が出たら許可）→ 予約台帳ができる
 * 3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *    実行するユーザー：自分 ／ アクセスできるユーザー：全員
 * 4. 出てきたURL（…/exec）を config.js の gasUrl に入れる
 */

var HEADERS = ['受付日時', 'お名前', '電話番号', 'メール', '地域', 'ご住所', 'お住まい',
  '台数', '概算（円）', '第1希望', '第2希望', '駐車場', 'メーカー・型番', 'ご要望', '流入元'];

function setup() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEET_ID')) {
    Logger.log('もう作ってあります：' + SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getUrl());
    return;
  }
  var ss = SpreadsheetApp.create('空調のホットライン 予約台帳');
  var sh = ss.getSheets()[0];
  sh.setName('予約');
  sh.appendRow(HEADERS);
  sh.setFrozenRows(1);
  props.setProperty('SHEET_ID', ss.getId());
  Logger.log('予約台帳を作りました：' + ss.getUrl());
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var d = JSON.parse(e.postData.contents || '{}');
    if (!d.name || !d.phone) return json_({ ok: false, error: 'missing' });
    var clip = function (v, n) { return String(v || '').slice(0, n || 300); };
    var row = [new Date(), clip(d.name, 60), clip(d.phone, 20), clip(d.email, 120), clip(d.area, 40), clip(d.address),
      clip(d.housing, 30), clip(d.units, 120), Number(d.estimate) || '', clip(d.date1, 20) + ' ' + clip(d.time1, 20),
      d.date2 ? clip(d.date2, 20) + ' ' + clip(d.time2, 20) : '', clip(d.parking, 40), clip(d.model, 80), clip(d.note, 1000), clip(d.from, 300)];
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    var sh = ss.getSheetByName('予約');
    sh.appendRow(row);
    // 受付番号：R + 月日4桁 + - + 行番号（例 R1116-12）。お客様の質問コーナーで使う
    var id = 'R' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MMdd') + '-' + sh.getLastRow();

    var body = '受付番号：' + id + '\n' + HEADERS.map(function (h, i) { return h + '：' + (row[i] instanceof Date ? Utilities.formatDate(row[i], 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') : row[i]); }).join('\n')
      + '\n\n予約台帳：' + ss.getUrl();
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '【新しい予約】' + id + ' ' + row[1] + ' 様（' + row[4] + '）', body);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return json_({ ok: true, hello: 'kucho-hotline reserve' }); }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
