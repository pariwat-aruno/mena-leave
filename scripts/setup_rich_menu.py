#!/usr/bin/env python3
"""
setup_rich_menu.py — ติดตั้ง rich menu ของ mena-leave ผ่าน LINE Messaging API

ใช้รูปสำเร็จ `scripts/richmenu-source.png` (ออกแบบไว้แล้ว) แทนการวาดด้วย Pillow
แค่ resize ให้พอดีขนาด LINE large (2500x1686) แล้ว upload + ผูก tap area

ใช้งาน:
  export LINE_CHANNEL_ACCESS_TOKEN='xxx'
  export LIFF_ID='2010175593-Fqjuhv0q'
  pip install Pillow requests
  python3 scripts/setup_rich_menu.py

Layout รูป (กริด 3 คอลัมน์ x 2 แถว = 6 ช่อง):
  Row 1: [ส่งใบลา] [ใบลาของฉัน] [อนุมัติ]
  Row 2: [จัดการ]  [คู่มือ]      [โลโก้ mena — ไม่มีปุ่ม]

URL ผูกแต่ละปุ่ม:
  https://liff.line.me/{LIFF_ID}/<page>   (concat subpath)
"""
import os
import sys
import json
import requests
from PIL import Image

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

# Image dimensions — LINE large rich menu (บังคับขนาดนี้)
W, H = 2500, 1686

# Source image ที่ออกแบบไว้ (อยู่ข้างไฟล์นี้)
SOURCE_IMAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'richmenu-source.png')

# Grid 3 คอลัมน์ x 2 แถว
COL_W = W // 3          # 833
ROW_H = H // 2          # 843

# (label, x, y, w, h, page)  — ช่องที่ 6 (โลโก้) ไม่ใส่ → ไม่มี action
AREAS = [
    ('ส่งใบลา',      0,           0,      COL_W,          ROW_H,          'request.html'),
    ('ใบลาของฉัน',   COL_W,       0,      COL_W,          ROW_H,          'my-requests.html'),
    ('อนุมัติ',       COL_W * 2,   0,      W - COL_W * 2,  ROW_H,          'approve.html'),
    ('จัดการ',       0,           ROW_H,  COL_W,          H - ROW_H,      'admin.html'),
    ('คู่มือ',        COL_W,       ROW_H,  COL_W,          H - ROW_H,      'manual.html'),
    # ช่อง 6 (โลโก้ mena): COL_W*2, ROW_H, … — ไม่มีปุ่ม (decorative)
]


def make_image(output_path):
    """โหลดรูปต้นฉบับ → resize เป็น 2500x1686 → save JPEG"""
    if not os.path.exists(SOURCE_IMAGE):
        print(f'ERROR: ไม่พบรูปต้นฉบับ {SOURCE_IMAGE}')
        sys.exit(1)
    img = Image.open(SOURCE_IMAGE).convert('RGB')
    if img.size != (W, H):
        print(f'  resize {img.size} → ({W}, {H})')
        img = img.resize((W, H), Image.LANCZOS)
    img.save(output_path, 'JPEG', quality=90, optimize=True)
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
    for (label, x, y, w, h, page) in AREAS:
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

    print('2) preparing image...')
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
