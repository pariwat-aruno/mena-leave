#!/usr/bin/env python3
"""
setup_rich_menu.py — สร้าง rich menu ของ mena-leave + upload ผ่าน LINE Messaging API

ใช้ครั้งเดียวหลังสร้าง LINE Messaging API channel + LIFF app แล้ว
ปุ่ม 5:
  1. ส่งใบลา           → request.html
  2. ใบลาของฉัน         → my-requests.html
  3. อนุมัติ            → approve.html  (auto stage-aware)
  4. จัดการ             → admin.html    (block VISITOR/USER ใน backend)
  5. คู่มือ              → manual.html

ใช้งาน:
  export LINE_CHANNEL_ACCESS_TOKEN='xxx'
  export LIFF_ID='2010175593-Fqjuhv0q'
  pip install Pillow requests
  python3 scripts/setup_rich_menu.py

URL ผูกแต่ละปุ่ม:
  https://liff.line.me/{LIFF_ID}/<page>.html
  (concat subpath pattern — LIFF เดียวสำหรับทุกหน้า)

Brand: minimal cherry/magenta — ห้าม emoji (CONTEXT §7)
"""
import os
import sys
import json
import requests
from PIL import Image, ImageDraw, ImageFont

TOKEN = os.environ.get('LINE_CHANNEL_ACCESS_TOKEN', '')
if not TOKEN:
    print('ERROR: ตั้ง env LINE_CHANNEL_ACCESS_TOKEN ก่อน')
    sys.exit(1)

LIFF_ID = os.environ.get('LIFF_ID', '')
if not LIFF_ID:
    print('ERROR: ตั้ง env LIFF_ID ก่อน')
    sys.exit(1)

HEADERS = {
    'Authorization': f'Bearer {TOKEN}',
    'Content-Type': 'application/json',
}
API = 'https://api.line.me/v2/bot'

# LINE large rich menu size
W, H = 2500, 1686
TINT = (252, 228, 239)         # #fce4ef — bg
PRIMARY = (213, 31, 125)       # #d51f7d — accent
DARK_TEXT = (40, 40, 40)
SUBTLE = (130, 130, 130)
BORDER = (240, 215, 228)
CARD_BG = (255, 255, 255)
ACCENT_BG = (255, 240, 247)    # ปุ่มหลัก primary action

# Layout — 5 ปุ่ม
# Row 1 (top, 3 ปุ่ม): ส่งใบลา (ใหญ่กลาง) | ใบลาของฉัน | อนุมัติ
# Row 2 (bottom, 2 ปุ่ม): จัดการ | คู่มือ
HALF_H = H // 2
THIRD_W = W // 3
HALF_W = W // 2

# (label, sublabel, x, y, w, h, page, is_primary)
AREAS = [
    ('ส่งใบลา',       'แจ้งลาป่วย / กิจ / พักร้อน',  0,           0,       THIRD_W,           HALF_H,     'request.html',      True),
    ('ใบลาของฉัน',     'ดูประวัติ + สถานะอนุมัติ',     THIRD_W,     0,       THIRD_W,           HALF_H,     'my-requests.html',  False),
    ('อนุมัติ',         'หัวหน้างาน / HR / เจ้าของ',    THIRD_W * 2, 0,       W - THIRD_W * 2,   HALF_H,     'approve.html',      False),
    ('จัดการ',         'พนักงาน · โควตา · กฎ',         0,           HALF_H,  HALF_W,            H - HALF_H, 'admin.html',        False),
    ('คู่มือ',          'วิธีใช้งานระบบ',                HALF_W,      HALF_H,  W - HALF_W,        H - HALF_H, 'manual.html',       False),
]


def find_thai_font():
    """หา bold + regular Thai font บน macOS"""
    bold_candidates = [
        os.path.expanduser('~/Library/Fonts/payroll-edge/Prompt-Bold.ttf'),
        '/System/Library/Fonts/Supplemental/Tahoma Bold.ttf',
        '/System/Library/Fonts/Supplemental/Thonburi.ttc',
        '/usr/share/fonts/truetype/tlwg/Sarabun-Bold.ttf',
    ]
    regular_candidates = [
        os.path.expanduser('~/Library/Fonts/payroll-edge/Prompt-Regular.ttf'),
        '/System/Library/Fonts/Supplemental/Tahoma.ttf',
        '/System/Library/Fonts/Supplemental/Thonburi.ttc',
        '/usr/share/fonts/truetype/tlwg/Sarabun.ttf',
    ]
    bold = next((p for p in bold_candidates if os.path.exists(p)), None)
    regular = next((p for p in regular_candidates if os.path.exists(p)), bold)
    return bold, regular


def draw_button(draw, x, y, w, h, label, sublabel, is_primary, label_font, sub_font, divider_font):
    """วาด 1 ปุ่ม minimal style"""
    pad = 16
    bg = ACCENT_BG if is_primary else CARD_BG
    draw.rectangle([x + pad, y + pad, x + w - pad, y + h - pad], fill=bg, outline=BORDER, width=4)

    # แถบสี primary ที่ขอบบน (สำหรับปุ่มหลัก)
    if is_primary:
        draw.rectangle([x + pad, y + pad, x + w - pad, y + pad + 18], fill=PRIMARY)

    # label (กลาง)
    cx = x + w // 2
    cy = y + h // 2

    try:
        lw = draw.textlength(label, font=label_font)
    except Exception:
        lw = 300
    draw.text((cx - lw / 2, cy - 80), label, font=label_font, fill=PRIMARY if is_primary else DARK_TEXT)

    # divider
    line_w = w // 4
    draw.line([(cx - line_w / 2, cy + 30), (cx + line_w / 2, cy + 30)], fill=PRIMARY if is_primary else BORDER, width=3)

    # sublabel (เล็ก)
    try:
        sw = draw.textlength(sublabel, font=sub_font)
    except Exception:
        sw = 200
    draw.text((cx - sw / 2, cy + 55), sublabel, font=sub_font, fill=SUBTLE)


def make_image(output_path):
    img = Image.new('RGB', (W, H), TINT)
    draw = ImageDraw.Draw(img)
    bold_path, regular_path = find_thai_font()
    if not bold_path:
        print('ERROR: ไม่พบ Thai font บนเครื่อง')
        sys.exit(1)
    print(f'  using bold: {bold_path}')
    print(f'  using regular: {regular_path}')

    label_font = ImageFont.truetype(bold_path, 110)
    sub_font = ImageFont.truetype(regular_path, 48)
    divider_font = None

    for (label, sublabel, x, y, w, h, _page, is_primary) in AREAS:
        draw_button(draw, x, y, w, h, label, sublabel, is_primary, label_font, sub_font, divider_font)

    # header band บนสุด (brand stripe)
    draw.rectangle([0, 0, W, 16], fill=PRIMARY)

    # footer band
    draw.rectangle([0, H - 12, W, H], fill=PRIMARY)

    img.save(output_path, 'JPEG', quality=88, optimize=True)
    print(f'✓ wrote image: {output_path}  ({os.path.getsize(output_path)} bytes)')


def get_existing_menus():
    res = requests.get(f'{API}/richmenu/list', headers={'Authorization': f'Bearer {TOKEN}'})
    if res.status_code != 200:
        print(f'list failed: {res.status_code} {res.text}')
        return []
    return res.json().get('richmenus', [])


def delete_menu(menu_id):
    res = requests.delete(f'{API}/richmenu/{menu_id}', headers={'Authorization': f'Bearer {TOKEN}'})
    print(f'  delete {menu_id}: {res.status_code}')


def create_menu():
    body = {
        'size': {'width': W, 'height': H},
        'selected': True,
        'name': 'mena-leave-default',
        'chatBarText': 'เมนูระบบลางาน',
        'areas': [],
    }
    for (label, _sub, x, y, w, h, page, _primary) in AREAS:
        uri = f'https://liff.line.me/{LIFF_ID}/{page}'
        body['areas'].append({
            'bounds': {'x': x, 'y': y, 'width': w, 'height': h},
            'action': {'type': 'uri', 'label': label, 'uri': uri},
        })

    res = requests.post(f'{API}/richmenu', headers=HEADERS, data=json.dumps(body))
    if res.status_code != 200:
        print(f'create failed: {res.status_code} {res.text}')
        sys.exit(1)
    menu_id = res.json()['richMenuId']
    print(f'✓ created menu: {menu_id}')
    return menu_id


def upload_image(menu_id, image_path):
    with open(image_path, 'rb') as f:
        res = requests.post(
            f'https://api-data.line.me/v2/bot/richmenu/{menu_id}/content',
            headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'image/jpeg'},
            data=f.read(),
        )
    if res.status_code != 200:
        print(f'upload image failed: {res.status_code} {res.text}')
        sys.exit(1)
    print('✓ image uploaded')


def set_default(menu_id):
    res = requests.post(f'{API}/user/all/richmenu/{menu_id}', headers={'Authorization': f'Bearer {TOKEN}'})
    if res.status_code != 200:
        print(f'set default failed: {res.status_code} {res.text}')
        sys.exit(1)
    print('✓ set as default')


def main():
    image_path = '/tmp/mena-leave-richmenu.jpg'

    print('1) deleting old menus named "mena-leave-default"...')
    for m in get_existing_menus():
        if m.get('name') == 'mena-leave-default':
            delete_menu(m['richMenuId'])

    print('2) generating image...')
    make_image(image_path)

    print('3) creating new menu...')
    menu_id = create_menu()

    print('4) uploading image...')
    upload_image(menu_id, image_path)

    print('5) setting as default for all users...')
    set_default(menu_id)

    print('\nDone — rich menu installed:')
    print('   menu_id =', menu_id)
    print('   พนักงานที่ add เพื่อนกับ OA แล้ว — ต้องปิด-เปิดแชทใหม่ หรือ unfriend+refriend เพื่อเห็นเมนูใหม่')


if __name__ == '__main__':
    main()
