#!/usr/bin/env python3
"""
setup_rich_menu.py — สร้าง rich menu ของ mena-leave + upload ผ่าน LINE Messaging API

ใช้ครั้งเดียวหลังสร้าง LINE Messaging API channel แล้ว
ปุ่มทั้ง 5:
  1. ส่งใบลา           → LIFF request.html
  2. ใบลาของฉัน         → LIFF my-requests.html
  3. อนุมัติ            → LIFF approve.html (auto stage-aware)
  4. จัดการ             → LIFF admin.html (block VISITOR/USER ใน backend)
  5. คู่มือ              → LIFF manual.html

ใช้งาน:
  export LINE_CHANNEL_ACCESS_TOKEN='xxx'
  export LIFF_ID_REQUEST='xxx-xxx'
  export LIFF_ID_HISTORY='xxx-xxx'
  export LIFF_ID_APPROVE='xxx-xxx'
  export LIFF_ID_ADMIN='xxx-xxx'
  export LIFF_ID_MANUAL='xxx-xxx'
  pip install Pillow requests
  python3 scripts/setup_rich_menu.py

ทำ 4 step:
  1) ลบ rich menu เก่า (ที่ชื่อ mena-leave-default)
  2) gen image 2500x1686 (LINE size large)
  3) upload menu definition → ได้ richMenuId
  4) upload image + set default
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

LIFF_REQUEST = os.environ.get('LIFF_ID_REQUEST', '')
LIFF_HISTORY = os.environ.get('LIFF_ID_HISTORY', '')
LIFF_APPROVE = os.environ.get('LIFF_ID_APPROVE', '')
LIFF_ADMIN = os.environ.get('LIFF_ID_ADMIN', '')
LIFF_MANUAL = os.environ.get('LIFF_ID_MANUAL', '')

if not all([LIFF_REQUEST, LIFF_HISTORY, LIFF_APPROVE, LIFF_ADMIN, LIFF_MANUAL]):
    print('WARN: บาง LIFF_ID env ว่าง — rich menu จะมี link ใช้ไม่ได้')

HEADERS = {
    'Authorization': f'Bearer {TOKEN}',
    'Content-Type': 'application/json',
}
API = 'https://api.line.me/v2/bot'

# Layout: 2500 x 1686 = LINE large rich menu size
# Grid 3-cols top + 2-cols bottom (1 ใหญ่กลาง + 4 มุม)
# ง่าย ๆ: 2 row × layout 3+2
W, H = 2500, 1686
TINT = (251, 234, 237)   # #fce4ef
PRIMARY = (200, 16, 46)  # #d51f7d
DARK_TEXT = (34, 34, 34)
SUBTLE = (102, 102, 102)
BORDER = (240, 220, 225)

# Areas (x, y, w, h) - 5 ปุ่ม
# Row 1 (top): 3 ปุ่ม
# Row 2 (bottom): 2 ปุ่ม
HALF_H = H // 2
THIRD_W = W // 3
HALF_W = W // 2

AREAS = [
    # (label, icon, x, y, w, h, liff_id)
    ('ส่งใบลา',       '📝', 0,             0,        THIRD_W,           HALF_H,            LIFF_REQUEST),
    ('ใบลาของฉัน',     '📋', THIRD_W,       0,        THIRD_W,           HALF_H,            LIFF_HISTORY),
    ('อนุมัติ',         '✅', THIRD_W * 2,   0,        W - THIRD_W * 2,   HALF_H,            LIFF_APPROVE),
    ('จัดการ',         '⚙️', 0,             HALF_H,   HALF_W,            H - HALF_H,        LIFF_ADMIN),
    ('คู่มือ',          '📖', HALF_W,        HALF_H,   W - HALF_W,        H - HALF_H,        LIFF_MANUAL),
]


def find_thai_font():
    """ลองหา font ที่รองรับไทยในระบบ — fallback default"""
    candidates = [
        '/usr/share/fonts/truetype/tlwg/Sarabun-Bold.ttf',
        '/usr/share/fonts/truetype/tlwg/Garuda-Bold.ttf',
        '/System/Library/Fonts/Supplemental/Tahoma.ttf',
        'C:/Windows/Fonts/tahomabd.ttf',
        '/usr/share/fonts/TTF/Sarabun-Bold.ttf',
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def make_image(output_path):
    img = Image.new('RGB', (W, H), TINT)
    draw = ImageDraw.Draw(img)
    font_path = find_thai_font()
    label_font = ImageFont.truetype(font_path, 80) if font_path else ImageFont.load_default()
    icon_font = ImageFont.truetype(font_path, 130) if font_path else ImageFont.load_default()

    for (label, icon, x, y, w, h, _liff) in AREAS:
        # cell background — slightly lighter
        draw.rectangle([x + 8, y + 8, x + w - 8, y + h - 8], fill=(255, 255, 255), outline=BORDER, width=4)
        # icon
        cx = x + w // 2
        cy = y + h // 2 - 60
        try:
            iw = draw.textlength(icon, font=icon_font)
        except Exception:
            iw = 100
        draw.text((cx - iw / 2, cy - 80), icon, font=icon_font, fill=PRIMARY)
        # label
        try:
            lw = draw.textlength(label, font=label_font)
        except Exception:
            lw = 200
        draw.text((cx - lw / 2, cy + 80), label, font=label_font, fill=DARK_TEXT)

    # header bar
    draw.rectangle([0, 0, W, 12], fill=PRIMARY)
    img.save(output_path, 'JPEG', quality=85, optimize=True)
    print(f'✓ wrote image: {output_path}')


def get_existing_menus():
    res = requests.get(f'{API}/richmenu/list', headers=HEADERS)
    if res.status_code != 200:
        print(f'list failed: {res.status_code} {res.text}')
        return []
    return res.json().get('richmenus', [])


def delete_menu(menu_id):
    res = requests.delete(f'{API}/richmenu/{menu_id}', headers=HEADERS)
    print(f'  delete {menu_id}: {res.status_code}')


def create_menu():
    body = {
        'size': {'width': W, 'height': H},
        'selected': True,
        'name': 'mena-leave-default',
        'chatBarText': 'เมนูระบบลางาน',
        'areas': [],
    }
    for (label, _icon, x, y, w, h, liff_id) in AREAS:
        if liff_id:
            uri = f'https://liff.line.me/{liff_id}'
        else:
            uri = 'https://line.me'
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
    res = requests.post(f'{API}/user/all/richmenu/{menu_id}', headers=HEADERS)
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

    print('\n✅ Done — rich menu installed:')
    print('   menu_id =', menu_id)
    print('   พนักงานที่ add เพื่อนกับ OA แล้ว ต้องลบเพื่อน + add ใหม่ เพื่อเห็นเมนูใหม่')


if __name__ == '__main__':
    main()
