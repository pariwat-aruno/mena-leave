/**
 * LiffSetup.gs — helper สำหรับจัดการ LIFF apps
 *
 * Architecture: 1 LIFF app เดียวสำหรับทุกหน้า (concat subpath pattern)
 *   - LIFF endpoint URL: https://pariwat-aruno.github.io/mena-leave
 *   - permanentLinkPattern: "concat"
 *   - liff.line.me/<id>/<page>.html → endpoint/<page>.html
 *
 * คำสั่ง:
 *   listLiffApps()  — list LIFF apps ของ channel นี้ (debug)
 *
 * Note: ไม่ใช้ API สร้าง LIFF อัตโนมัติ เพราะ Messaging API channel
 * ไม่รองรับ POST /liff/v1/apps (ต้อง LINE Login channel)
 * → ให้ admin สร้าง LIFF ผ่าน Console UI แล้วใส่ LIFF_ID ใน Script Properties
 */

/** list LIFF ทั้งหมดของ channel นี้ — สำหรับ verify หลังสร้าง LIFF */
function listLiffApps() {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งใน Script Properties');

  const res = UrlFetchApp.fetch('https://api.line.me/liff/v1/apps', {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) {
    console.log('error ' + code + ': ' + res.getContentText());
    return;
  }
  const apps = JSON.parse(res.getContentText()).apps || [];
  console.log('LIFF apps ใน channel นี้: ' + apps.length + ' ตัว');
  apps.forEach(function (a) {
    console.log('  ' + a.liffId + '  [' + a.view.type + ']  ' + a.view.url);
  });
  return apps;
}
