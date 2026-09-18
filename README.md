# Travian Benzeri Telegram Botu — Görsel Köy (Mini App)

Oyun artık metin menüleri yerine **Telegram Mini App** ile, gerçek bir köy
görselinde binalara dokunarak oynanıyor.

## Klasör Yapısı

```
travian-bot/
├── package.json        # Bağımlılıklar
├── .env.example         # Token / URL şablonu (kopyalayıp .env yap)
├── .gitignore
├── database.js          # SQLite bağlantısı + tablo oluşturma
├── game-config.js        # Bina maliyet/süre/üretim formülleri
├── resources.js          # Saatlik kaynak üretimi hesaplama
├── buildings.js           # Bina yükseltme mantığı
├── scheduler.js            # Arka planda her dakika çalışan zamanlayıcı
├── server.js                # Mini App'in API sunucusu (+ statik dosyalar)
├── bot.js                    # Botun ana dosyası (/start, Mini App butonu)
├── webapp/                    # Mini App'in kendisi (tarayıcıda çalışan kısım)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── game.db                     # İlk çalıştırmada otomatik oluşur
```

> **Not:** Veritabanı için `better-sqlite3` yerine Node.js'in kendi içine
> gömülü `node:sqlite` modülünü kullanıyoruz (native derleme gerekmiyor).
> Bunun için **Node.js 24 veya üzeri** gerekiyor.

## Mimari: Neden Bir "Web Sunucusu" da Var?

Telegram botları normal mesaj/buton tabanlıdır; gerçek anlamda tıklanabilir,
görsel bir ekran göstermek için Telegram'ın **Mini App (Web App)** özelliği
kullanılır. Bu, botun içinden açılan, senin yazdığın bir web sayfasıdır
(HTML/CSS/JS). Bu yüzden projeye `server.js` (bu sayfayı ve verisini sunan
küçük bir web sunucusu) ve `webapp/` klasörü (sayfanın kendisi) eklendi.
`npm start` dediğinde hem bot hem bu sunucu **aynı anda, tek komutla**
başlar — iki ayrı şey çalıştırmana gerek yok.

**Önemli kısıtlama:** Telegram, Mini App'lerin **HTTPS** üzerinden
sunulmasını zorunlu kılar. `http://localhost:3000` gibi bir adresi Telegram
kabul etmez. Bu yüzden yerel geliştirme sırasında bilgisayarındaki sunucuyu
geçici bir HTTPS adresine "tünelleyen" ücretsiz bir araç olan **ngrok**
kullanacağız.

## Kurulum Adımları

1. **Node.js sürümünü kontrol et.**
   ```
   node -v
   ```
   `v24.x` veya üzeri olmalı (senin kurulu sürümün v26.9.0 — sorun yok).

2. **Bağımlılıkları yükle.**
   ```
   npm install
   ```

3. **Bot token'ı al.** Telegram'da `@BotFather` ile konuş, `/newbot` ile
   bot oluştur, verdiği token'ı kopyala.

4. **ngrok kur.** https://ngrok.com/download adresinden indir (ücretsiz
   hesap yeterli). Kurulumdan sonra bir kere şunu çalıştırman gerekebilir
   (ngrok sitesindeki "Setup & Installation" sayfasında sana özel authtoken
   komutunu verir):
   ```
   ngrok config add-authtoken <sana_verilen_token>
   ```

5. **ngrok'u başlat** (ayrı bir terminal penceresinde, açık bırak):
   ```
   ngrok http 3000
   ```
   Ekranda `Forwarding  https://xxxx.ngrok-free.app -> http://localhost:3000`
   gibi bir satır göreceksin. `https://xxxx.ngrok-free.app` kısmını kopyala.

   > ngrok'un ücretsiz sürümünde bu adres her yeniden başlattığında
   > değişir. Adres değişirse aşağıdaki `.env` dosyasındaki `WEBAPP_URL`
   > değerini güncellemen ve botu yeniden başlatman gerekir.

6. **.env dosyası oluştur.** `.env.example` dosyasını kopyalayıp `.env`
   yap, içine:
   - `BOT_TOKEN` → BotFather'dan aldığın token
   - `WEBAPP_URL` → ngrok'un verdiği https adresi (5. adım)
   - `PORT` → `3000` (ngrok'a verdiğin port ile aynı olmalı)

7. **Botu çalıştır** (ngrok hâlâ başka bir pencerede açık kalsın):
   ```
   npm start
   ```
   "Bot başarıyla başlatıldı!" ve "Mini App sunucusu ... çalışıyor"
   satırlarını görmelisin.

8. Telegram'da botuna `/start` yaz, gelen **"🎮 Köyünü Aç"** butonuna bas.
   Karşına köyünün görseli çıkacak — binalara dokunarak seviyelerini,
   yükseltme maliyetlerini görebilir ve yükseltebilirsin.

## Şu An Ne Çalışıyor?

- `/start` → kullanıcıyı ve köyünü veritabanına kaydeder, **"🎮 Köyünü Aç"**
  butonunu gösterir. `/koy` komutu da aynı butonu tekrar getirir.
- **Köyüm ekranı** → binaların gerçek bir köy sahnesinde (çim, patika,
  binalar) simgelerle gösterildiği görsel bir ekran. Üstte kaynak çubuğu
  (Odun/Tuğla/Demir/Tahıl + saatlik üretim) var.
- **Bir binaya dokunmak** → alttan açılan bir panelde binanın adı, seviyesi,
  ne işe yaradığı, bir sonraki seviyenin maliyeti (yetersiz kaynaklar
  kırmızı gösterilir) ve süresi görünür; "Yükselt" butonuyla inşaat
  başlatılır.
- **İnşaat sırasında** → hem köy sahnesindeki binanın üzerinde hem de
  panelde gerçek zamanlı geri sayım görünür; süre dolunca ekran otomatik
  güncellenir.
- Alt sekmelerden **Askeriye / Pazar / Saldır** → henüz "yakında eklenecek"
  bilgisi gösteriyor (Aşama 3/4'te dolacak).
- Kaynaklar hâlâ saatlik olarak, hem ekran her açıldığında/yenilendiğinde
  hem de arka plandaki zamanlayıcı ile üretiliyor.

### Bu Aşamada Eklenen/Değişen Dosyalar

- `server.js` — Mini App'in API'si: köy verisini gönderir, yükseltme
  isteklerini işler. Telegram'dan gelen kullanıcı bilgisinin gerçekten
  Telegram tarafından imzalandığını (`initData`) doğrular.
- `webapp/index.html`, `webapp/style.css`, `webapp/app.js` — görsel arayüzün
  kendisi: köy sahnesi, bina simgeleri (el yapımı SVG ikonlar), detay
  paneli, geri sayımlar.
- `bot.js` — artık metin menüleri yok; sadece kullanıcı/köy kaydı ve
  Mini App'i açan buton var.
- `game-config.js`, `resources.js`, `buildings.js`, `scheduler.js` —
  değişmedi, Mini App bunların üzerine kuruldu (oyun mantığı hâlâ burada).

## Sırada Ne Var?

Aşama 3: Kışladan asker üretimi ve oyuncular arası saldırı/yağma sistemi
(Askeriye ve Saldır sekmeleri dolacak).
