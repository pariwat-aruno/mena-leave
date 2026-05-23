#!/usr/bin/env python3
"""
setup_rich_menu.py — สร้าง rich menu ของ mena-leave + upload ผ่าน LINE Messaging API

ใช้งาน:
  export LINE_CHANNEL_ACCESS_TOKEN='xxx'
  export LIFF_ID='2010175593-Fqjuhv0q'
  pip install Pillow requests
  python3 scripts/setup_rich_menu.py

Layout (2500 x 1686):
  - Header band 280px: logo "mena" cursive (Brush Script) + tagline ระบบลางาน
  - Body 1406px:
      Row 1 (3 cols): [ส่งใบลา primary] [ใบลาของฉัน] [อนุมัติ]
      Row 2 (2 cols): [จัดการ]               [คู่มือ]

URL ผูกแต่ละปุ่ม:
  https://liff.line.me/{LIFF_ID}/<page>.html   (concat subpath)

Brand: minimal cherry/magenta — ห้าม emoji (CONTEXT §7)
"""
import os
import sys
import json
import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter

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

# Image dimensions — LINE large rich menu
W, H = 2500, 1686
HEADER_H = 280  # logo band
BODY_Y = HEADER_H
BODY_H = H - HEADER_H

# Brand palette
WHITE = (255, 255, 255)
TINT = (252, 228, 239)         # #fce4ef
TINT_SOFT = (254, 240, 246)
PRIMARY = (213, 31, 125)       # #d51f7d
PRIMARY_DARK = (160, 21, 96)
DARK_TEXT = (40, 40, 40)
SUBTLE = (130, 130, 130)
BORDER = (240, 215, 228)
SHADOW = (215, 195, 205)
BAR_HEAD = (213, 31, 125)

# Grid: row1 = 3 cols, row2 = 2 cols
ROW_H = BODY_H // 2     # 703
COL_W3 = W // 3          # 833
COL_W2 = W // 2          # 1250

# (label, sublabel, x, y, w, h, page, is_primary)
AREAS = [
    ('ส่งใบลา',       'แจ้งลาป่วย / กิจ / พักร้อน',  0,           BODY_Y,            COL_W3,          ROW_H,             'request.html',      True),
    ('ใบลาของฉัน',     'ดูประวัติ + สถานะอนุมัติ',     COL_W3,      BODY_Y,            COL_W3,          ROW_H,             'my-requests.html',  False),
    ('อนุมัติ',         'หัวหน้างาน / HR / เจ้าของ',    COL_W3 * 2,  BODY_Y,            W - COL_W3 * 2,  ROW_H,             'approve.html',      False),
    ('จัดการ',         'พนักงาน · โควตา · กฎ',         0,           BODY_Y + ROW_H,    COL_W2,          BODY_H - ROW_H,    'admin.html',        False),
    ('คู่มือ',          'วิธีใช้งานระบบ',                COL_W2,      BODY_Y + ROW_H,    W - COL_W2,      BODY_H - ROW_H,    'manual.html',       False),
]


def find_font(candidates):
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def get_fonts():
    bold = find_font([
        os.path.expanduser('~/Library/Fonts/payroll-edge/Prompt-Bold.ttf'),
        '/System/Library/Fonts/Supplemental/Tahoma Bold.ttf',
        '/usr/share/fonts/truetype/tlwg/Sarabun-Bold.ttf',
    ])
    regular = find_font([
        os.path.expanduser('~/Library/Fonts/payroll-edge/Prompt-Regular.ttf'),
        '/System/Library/Fonts/Supplemental/Tahoma.ttf',
        '/usr/share/fonts/truetype/tlwg/Sarabun.ttf',
    ])
    cursive = find_font([
        '/System/Library/Fonts/Supplemental/Brush Script.ttf',
        '/System/Library/Fonts/Supplemental/Zapfino.ttf',
        '/System/Library/Fonts/Noteworthy.ttc',
    ])
    if not bold or not regular:
        print('ERROR: ไม่พบ Thai font บนเครื่อง')
        sys.exit(1)
    if not cursive:
        print('WARN: ไม่พบ cursive font — logo จะใช้ Prompt-Bold italic แทน')
    return bold, regular, cursive


def draw_logo_band(draw, img, label_font, sub_font, cursive_font):
    """วาด header band บนสุด: logo 'mena' cursive + tagline"""
    # background ขาว
    draw.rectangle([0, 0, W, HEADER_H], fill=WHITE)

    # ขีดเส้นล่าง band บางๆ
    draw.rectangle([0, HEADER_H - 6, W, HEADER_H], fill=TINT)

    cx = W // 2

    # cursive "mena" logo
    if cursive_font:
        try:
            mena_w = draw.textlength('mena', font=cursive_font)
        except Exception:
            mena_w = 400
        draw.text((cx - mena_w / 2, 30), 'mena', font=cursive_font, fill=PRIMARY)
    else:
        # fallback: italic Prompt
        try:
            mena_w = draw.textlength('mena', font=label_font)
        except Exception:
            mena_w = 280
        draw.text((cx - mena_w / 2, 50), 'mena', font=label_font, fill=PRIMARY)

    # tagline
    tag = 'ระบบลางาน'
    try:
        tag_w = draw.textlength(tag, font=sub_font)
    except Exception:
        tag_w = 200
    draw.text((cx - tag_w / 2, HEADER_H - 80), tag, font=sub_font, fill=SUBTLE)


def draw_button(draw, x, y, w, h, label, sublabel, is_primary, label_font, sub_font, icon_font):
    """วาด 1 ปุ่ม card-style"""
    pad = 28
    inner_pad = 14

    # shadow effect (เลื่อนลง 4px)
    draw.rectangle([x + pad + 4, y + pad + 4, x + w - pad + 4, y + h - pad + 4], fill=SHADOW)

    # card
    bg = PRIMARY if is_primary else WHITE
    border_color = PRIMARY_DARK if is_primary else BORDER
    text_color = WHITE if is_primary else DARK_TEXT
    sub_color = (255, 220, 235) if is_primary else SUBTLE
    accent_color = WHITE if is_primary else PRIMARY

    draw.rectangle([x + pad, y + pad, x + w - pad, y + h - pad], fill=bg, outline=border_color, width=4)

    cx = x + w // 2
    cy = y + h // 2

    # accent dot / shape (top of card) - just a small horizontal line
    acc_w = w // 6
    draw.rectangle([cx - acc_w / 2, y + pad + 60, cx + acc_w / 2, y + pad + 70], fill=accent_color)

    # label (กลาง)
    try:
        lw = draw.textlength(label, font=label_font)
    except Exception:
        lw = 300
    draw.text((cx - lw / 2, cy - 80), label, font=label_font, fill=text_color)

    # divider line
    line_w = w // 5
    draw.line([(cx - line_w / 2, cy + 40), (cx + line_w / 2, cy + 40)], fill=accent_color, width=3)

    # sublabel (เล็ก)
    try:
        sw = draw.textlength(sublabel, font=sub_font)
    except Exception:
        sw = 200
    draw.text((cx - sw / 2, cy + 60), sublabel, font=sub_font, fill=sub_color)


def make_image(output_path):
    bold_path, regular_path, cursive_path = get_fonts()
    print(f'  bold:    {bold_path}')
    print(f'  regular: {regular_path}')
    print(f'  cursive: {cursive_path or "(fallback)"}')

    img = Image.new('RGB', (W, H), TINT)
    draw = ImageDraw.Draw(img)

    # fonts
    logo_font = ImageFont.truetype(cursive_path, 220) if cursive_path else ImageFont.truetype(bold_path, 180)
    tagline_font = ImageFont.truetype(regular_path, 56)
    btn_label_font = ImageFont.truetype(bold_path, 130)
    btn_sub_font = ImageFont.truetype(regular_path, 46)

    # 1) Header logo band
    draw_logo_band(draw, img, logo_font, tagline_font, logo_font)

    # 2) Body buttons
    for (label, sublabel, x, y, w, h, _page, is_primary) in AREAS:
        draw_button(draw, x, y, w, h, label, sublabel, is_primary,
                    btn_label_font, btn_sub_font, None)

    img.save(output_path, 'JPEG', quality=90, optimize=True)
    print(f'\n✓ wrote image: {output_path}  ({os.path.getsize(output_path)} bytes)')


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
