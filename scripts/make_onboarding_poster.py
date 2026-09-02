#!/usr/bin/env python3
"""
สร้างรูป "ขั้นตอนเข้าใช้ระบบลางาน" พร้อม QR เพิ่มเพื่อน LINE OA
สำหรับส่งเข้าไลน์กลุ่มบริษัท / ปริ้นติดบอร์ด

รัน: python3 scripts/make_onboarding_poster.py
ผลลัพธ์: docs/onboarding/onboarding-poster.png  (1240x1754 = A4 ที่ 150dpi)

⭐ ทำไมต้องผ่าน Chrome ไม่วาดด้วย PIL ตรง ๆ
   PIL บนเครื่องนี้ไม่มี Raqm (ตัวจัดวางอักษร) → สระกับวรรณยุกต์ไทยออกมาเป็นวงกลมจุดไข่ปลา
   ทั้งหน้า เรนเดอร์ผ่านเบราว์เซอร์แทนถึงจะได้ภาษาไทยที่อ่านออก
   (ตรวจก่อนได้ด้วย: python3 -c "from PIL import features; print(features.check('raqm'))")

⭐ ไม่มีข้อมูลพนักงานในรูปนี้ — repo เป็น public ห้ามใส่ชื่อคนจริง
"""
import base64
import os
import subprocess
import sys
import tempfile

import segno

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs", "onboarding")
OUT = os.path.join(OUT_DIR, "onboarding-poster.png")
LOGO = os.path.join(ROOT, "liff", "img", "logo.jpg")

LINE_OA_ID = "@966nnfkr"
ADD_FRIEND_URL = "https://line.me/R/ti/p/" + LINE_OA_ID

W, H = 1240, 1754
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

HTML = """<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{
    width:{W}px; height:{H}px; background:#fff; color:#2b2b2b;
    font-family:"Thonburi","Sarabun","Noto Sans Thai",-apple-system,sans-serif;
    -webkit-font-smoothing:antialiased;
  }}
  .top {{ background:#d51f7d; color:#fff; text-align:center; padding:34px 0 30px; }}
  .top img {{ height:86px; background:#fff; padding:12px 22px; border-radius:14px; margin-bottom:12px; }}
  .top .name {{ font-size:38px; font-weight:700; letter-spacing:1px; }}
  h1 {{ font-size:74px; font-weight:700; text-align:center; margin-top:38px; }}
  .lead {{ font-size:36px; color:#7a7a7a; text-align:center; margin-top:12px; }}
  .qrwrap {{ width:556px; margin:28px auto 0; background:#fce4ef; padding:18px; border-radius:16px; }}
  .qrwrap img {{ width:520px; height:520px; display:block; }}
  .scan {{ font-size:40px; font-weight:700; color:#d51f7d; text-align:center; margin-top:26px; }}
  .oaid {{ font-size:33px; color:#7a7a7a; text-align:center; margin-top:8px; }}
  .steps {{ margin:38px 84px 0; }}
  .step {{ display:flex; align-items:flex-start; margin-bottom:30px; }}
  .num {{
    flex:0 0 74px; width:74px; height:74px; border-radius:50%; background:#d51f7d;
    color:#fff; font-size:40px; font-weight:700; display:flex;
    align-items:center; justify-content:center; margin-right:28px;
  }}
  .step h2 {{ font-size:42px; font-weight:700; line-height:1.25; }}
  .step p {{ font-size:33px; color:#7a7a7a; margin-top:6px; line-height:1.35; }}
  .note {{
    margin:8px 84px 0; background:#fce4ef; border-radius:14px; padding:26px 30px;
  }}
  .note b {{ font-size:33px; color:#a01560; }}
  .note p {{ font-size:30px; margin-top:10px; line-height:1.4; }}
  .foot {{ text-align:center; margin-top:30px;
           font-size:26px; color:#9a9a9a; letter-spacing:1px; }}
</style></head><body>
  <div class="top">{logo}<div class="name">MENA COSMETICS</div></div>

  <h1>เริ่มใช้ระบบลางาน</h1>
  <div class="lead">ทำครั้งเดียว ใช้เวลาไม่ถึง 1 นาที</div>

  <div class="qrwrap"><img src="data:image/png;base64,{qr}"></div>
  <div class="scan">สแกน QR นี้ด้วยแอป LINE</div>
  <div class="oaid">หรือค้นหาไอดี {oa}</div>

  <div class="steps">
    <div class="step"><div class="num">1</div><div>
      <h2>เพิ่มเพื่อน</h2><p>สแกน QR ด้านบน แล้วกดเพิ่มเพื่อน</p></div></div>
    <div class="step"><div class="num">2</div><div>
      <h2>กดปุ่มที่ระบบทักมา</h2><p>ระบบจะทักกลับทันที กดปุ่ม &ldquo;ผูกบัญชีของฉัน&rdquo;</p></div></div>
    <div class="step"><div class="num">3</div><div>
      <h2>กรอก 2 ช่อง</h2><p>รหัสพนักงาน + ชื่อ-นามสกุล แล้วกดผูกบัญชี</p></div></div>
  </div>

  <div class="note">
    <b>ผูกบัญชีไม่สำเร็จ?</b>
    <p>ชื่อในทะเบียนอาจสะกดไม่ตรงกับที่กรอก ติดต่อฝ่ายบุคคลเพื่อขอรหัสจับคู่ 6 หลัก</p>
  </div>

  <div class="foot">MENA COSMETICS</div>
</body></html>"""


def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def main():
    if not os.path.exists(CHROME):
        print("ERROR: ไม่พบ Google Chrome — สคริปต์นี้เรนเดอร์ผ่าน Chrome", file=sys.stderr)
        sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        qr_path = os.path.join(tmp, "qr.png")
        segno.make(ADD_FRIEND_URL, error="h").save(qr_path, scale=20, border=2, dark="#a01560")

        logo_tag = ""
        if os.path.exists(LOGO):
            logo_tag = '<img src="data:image/jpeg;base64,' + b64(LOGO) + '">'

        html = HTML.format(W=W, H=H, qr=b64(qr_path), oa=LINE_OA_ID, logo=logo_tag)
        html_path = os.path.join(tmp, "poster.html")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)

        cmd = [
            CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--default-background-color=ffffff",
            "--screenshot=" + OUT,
            "--window-size=%d,%d" % (W, H),
            "file://" + html_path,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if not os.path.exists(OUT):
            print(res.stdout + res.stderr, file=sys.stderr)
            sys.exit(1)

    print("เขียนแล้ว: " + OUT + "  (" + str(W) + "x" + str(H) + ")")


if __name__ == "__main__":
    main()
