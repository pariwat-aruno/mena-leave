# Image assets

## logo.jpg
**ต้องวางเอง** — Claude สร้างไฟล์ jpg ของ Mena ให้ไม่ได้ในสภาพแวดล้อมนี้

ขนาดแนะนำ: 200x200 pixel, square, JPEG
ใช้ที่ไหน: header ทุก LIFF page + ตัวแทนใน LINE flex card (ถ้า brand_logo_url ใน Sheet Settings ยังว่าง)

ถ้ายังไม่มี — เปิด LIFF จะใช้ `logo.svg` แทน (placeholder ตัวอักษร "V") โดยทุก HTML ใช้:
```html
<img class="logo" src="./img/logo.jpg" onerror="this.src='./img/logo.svg'">
```

## หลังมี logo จริง
1. วาง `logo.jpg` ที่นี่
2. commit + push GitHub
3. ใน admin LIFF → tab "Settings" → ใส่ `brand_logo_url` = Drive URL ของ logo
   (Drive → upload logo.jpg → set anyone with link → copy URL)
4. Flex card ใน LINE จะใช้ Drive URL (เพราะ LINE ไม่ render GitHub Pages img)
