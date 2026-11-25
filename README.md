# Bot Discord All-in-One

Bot Discord berbasis **Node.js + discord.js v14** dengan slash command untuk moderasi, utility, embed greeting/goodbye yang bisa diedit dari Discord, auto-role, sistem tiket, pemutar musik, temp voice, giveaway, leveling, starboard, AFK, statistik server, ekonomi koin, mini game Fishing (mancing ikan) dan Mining (menambang), quest harian & mingguan, ulang tahun dengan ucapan otomatis, command hiburan, gacha & duel kartu, auto-publish pengumuman, dan log pesan.

Kamu hanya perlu membuat aplikasi Discord sendiri, lalu mengisi **Application ID** dan **Bot Token** ke file `.env`.

---

## Fitur

| Kategori | Command |
| --- | --- |
| Umum | `/ping`, `/help`, `/serverinfo`, `/userinfo`, `/avatar`, `/botstats` |
| Komunitas | `/poll`, `/rolepanel create`, `/remindme`, `/reminders`, `/remindcancel`, `/giveaway`, `/afk`, `/birthday`, `/rank`, `/leaderboard` |
| Ekonomi | `/balance`, `/daily`, `/work`, `/pay`, `/richest` |
| Hiburan | `/8ball`, `/roll`, `/coinflip`, `/choose`, `/fish cast\|sell\|bag\|shop\|buy\|equip\|bait\|guide\|stats\|supply\|leaderboard`, `/mine dig\|sell\|bag\|shop\|buy\|equip\|light\|guide\|stats\|supply\|leaderboard`, `/quests daily\|weekly\|claim` |
| Kartu | `/gacha`, `/cards koleksi\|info\|jual\|upgrade\|rank\|odds`, `/battle` |
| Moderasi | `/ban`, `/unban`, `/kick`, `/timeout`, `/purge`, `/slowmode`, `/warn`, `/warnings`, `/clearwarn`, `/history`, `/modlog`, `/warnconfig`, `/lockdown` |
| Pengaturan | `/embed greeting\|goodbye\|test\|reset`, `/autorole set\|off\|status`, `/tempvoice`, `/levelconfig`, `/starboard`, `/serverstats`, `/autopublish`, `/messagelog`, `/birthdayconfig`, `/musicconfig` |
| Tiket | `/ticket setup\|close\|add\|remove` + tombol Buka/Tutup Tiket |
| Musik | `/play`, `/playnext`, `/skip`, `/stop`, `/pause`, `/resume`, `/queue`, `/nowplaying`, `/shuffle`, `/remove`, `/move`, `/clear`, `/volume` |

Catatan musik:

- Sumber audio: YouTube dan situs yang didukung [yt-dlp](https://github.com/yt-dlp/yt-dlp) (mis. SoundCloud).
- **Spotify didukung**: tempel link lagu, album, playlist, atau artis Spotify ke `/play`. Metadata diambil dari Spotify, lalu audionya dicari otomatis di YouTube (Spotify tidak mengizinkan streaming langsung).
- Kalau `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` diisi, bot memakai Spotify Web API resmi. Kalau tidak, bot mencoba token anonim/halaman embed (lebih mudah kena rate limit).
- ffmpeg dan yt-dlp sudah otomatis terpasang lewat npm, tidak perlu install manual.
- Live stream (radio) didukung; durasi ditampilkan sebagai `LIVE`.

---

## Prasyarat

- **Node.js 22.12 atau lebih baru** (sudah dicek: Node v26 di komputermu).
- Akun Discord dan satu server tempat kamu punya izin Administrator.

---

## 1. Install dependency

```powershell
npm install
```

Perintah ini juga mengunduh `ffmpeg.exe` dan `yt-dlp.exe` ke folder `node_modules`.

---

## 2. Buat aplikasi Discord & ambil kredensial

1. Buka <https://discord.com/developers/applications> lalu klik **New Application**.
2. Beri nama aplikasi (nama ini juga nama bot) lalu setujui ToS.
3. Di halaman **General Information**, salin **Application ID**.
4. Buka tab **Bot**, klik **Reset Token** lalu salin tokennya.
   - Token hanya ditampilkan sekali. Simpan dulu di tempat aman.
   - Jangan pernah membagikan token ke orang lain.
5. Masih di tab **Bot**, scroll ke **Privileged Gateway Intents** dan aktifkan:
   - ✅ **Server Members Intent** (wajib, untuk greeting, goodbye & auto-role)
   - ⬜ **Message Content Intent** (opsional; hanya perlu jika ingin teks lengkap di starboard dan deteksi mention AFK)
6. Klik **Save Changes**.

> Bot juga memakai intent non-privileged **Guild Messages** dan **Guild Message Reactions** untuk leveling, AFK, dan starboard. Intent ini tidak perlu diaktifkan manual di portal.

---

## 3. Isi file `.env`

Salin `.env.example` menjadi `.env`, lalu isi dua nilai wajib:

```powershell
Copy-Item .env.example .env
notepad .env
```

```env
DISCORD_CLIENT_ID=123456789012345678
DISCORD_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DISCORD_GUILD_ID=          # opsional, isi ID server untuk testing cepat
```

- `DISCORD_GUILD_ID` **opsional**. Kalau diisi, slash command langsung muncul di server itu (instan). Kalau kosong, command didaftarkan global (bisa perlu sampai 1 jam).
- `OWNER_IDS` opsional, isi ID Discord kamu agar bisa melewati cek hierarki role saat moderasi.
- `MUSIC_VOLUME`, `MUSIC_MAX_QUEUE`, `EMBED_COLOR` opsional. `MUSIC_MAX_QUEUE=0` berarti antrean tanpa batas; isi angka positif kalau mau membatasi.
- `SPOTIFY_CLIENT_ID` dan `SPOTIFY_CLIENT_SECRET` opsional, untuk memutar link Spotify dengan stabil. Lihat bagian [Spotify](#spotify-opsional).
- `MESSAGE_CONTENT_INTENT=true` opsional. Isi hanya jika **Message Content Intent** sudah diaktifkan di Developer Portal. Tanpa ini, teks pesan di starboard dan deteksi mention AFK tidak akan terbaca.

> **Jangan commit file `.env`.** File itu sudah masuk `.gitignore`.

---

## 4. Undang bot ke server

Ganti `CLIENT_ID` dengan Application ID milikmu, lalu buka URL ini:

```text
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=1099800374390&scope=bot%20applications.commands
```

Izin yang diminta: View Channel, Send Messages, Embed Links, Attach Files, Read History, Manage Messages/Channels/Roles, Move Members, Kick, Ban, Timeout, Connect, Speak, Add Reactions, Use External Emojis, Manage Server.

Kalau kamu ingin bot otomatis punya semua izin (hanya untuk server pribadi/testing), ganti `permissions=1099800374390` menjadi `permissions=8` (Administrator).

---

## 5. Daftarkan slash command

```powershell
npm run deploy
```

- Kalau `DISCORD_GUILD_ID` diisi, command hanya didaftarkan ke server itu.
- Kalau `DISCORD_GUILD_ID` kosong, command didaftarkan **global** sekaligus ke **semua server yang sudah diikuti bot**. Salinan khusus server membuat command langsung tersedia untuk semua member tanpa menunggu propagasi global (bisa sampai 1 jam).
- Bot juga menyinkronkan command ke setiap server otomatis saat start (`npm start`) dan saat bergabung ke server baru, jadi command baru langsung bisa dipakai semua member.

Jalankan ulang perintah ini setiap kali kamu mengubah/menambah command (atau cukup restart bot).

---

## 6. Jalankan bot

```powershell
npm start
```

Untuk development dengan auto-restart saat file berubah:

```powershell
npm run dev
```

Jika berhasil, console menampilkan `Login sebagai NamaBot#1234` dan bot online di server.

---

## Cara pakai fitur utama

### Embed greeting & goodbye

Greeting dikirim saat member baru join, goodbye saat member keluar. Keduanya **diatur langsung dari Discord** lewat panel interaktif:

```text
/embed greeting     # buka editor embed member join
/embed goodbye      # buka editor embed member leave
/embed test jenis:Greeting
/embed reset jenis:Goodbye
/autorole set role:@Member
```

Di panel editor kamu bisa:

1. Pilih channel pengiriman lewat dropdown **Pilih channel pengiriman**.
2. Pilih bagian yang ingin diubah dari menu **Pilih bagian embed yang ingin diubah**:

   | Bagian | Keterangan |
   | --- | --- |
   | Pesan teks (di luar embed) | teks biasa di atas embed, boleh kosong |
   | Judul embed | maksimal 256 karakter |
   | Deskripsi embed | maksimal 4000 karakter |
   | Warna embed | format hex `#2ECC71`; kosongkan untuk warna default |
   | Gambar / GIF (URL) | gambar besar di bawah embed |
   | Thumbnail (URL) | gambar kecil di kanan atas embed |
   | Footer embed | teks kecil di bawah embed |

3. Klik **Aktifkan** / **Matikan** untuk mengontrol pengiriman.
4. Klik **Kirim Test** untuk mengirim contoh embed ke channel pengaturan.
5. Klik **Tutup** untuk menutup panel.

Semua perubahan **langsung tersimpan** dan pratinjau di panel ikut diperbarui.

**Menambahkan gambar atau GIF:** isi bagian **Gambar / GIF (URL)** atau **Thumbnail (URL)** dengan link langsung ke file gambar, contoh:

```text
https://media.giphy.com/media/xxxxx/giphy.gif
https://i.imgur.com/xxxxx.png
```

Link harus berupa URL langsung (`http://` atau `https://`) ke file gambar/GIF, bukan link halaman. Discord memvalidasi URL saat embed dikirim, jadi link dari Discord CDN lama bisa kedaluwarsa — gunakan hosting permanen seperti Imgur/Giphy. Kamu juga bisa memakai placeholder `{avatar}` atau `{serverIcon}`.

Placeholder yang bisa dipakai di pesan teks, judul, deskripsi, dan footer:

| Placeholder | Arti |
| --- | --- |
| `{user}` | mention member |
| `{username}` | username member |
| `{displayName}` | nama tampilan member di server |
| `{server}` | nama server |
| `{memberCount}` | jumlah member saat ini |
| `{createdAt}` | umur akun Discord member |
| `{joinedAt}` | kapan member join |

Khusus isian gambar/thumbnail, placeholder yang didukung: `{avatar}` dan `{serverIcon}`.

### Tiket

```text
/ticket setup channel:#buat-tiket kategori:#Tiket staff_role:@Staff
```

Setelah panel terkirim, member klik **Buka Tiket** → bot membuat channel privat `tiket-0001` yang hanya bisa dilihat pembuat tiket + staff. Di dalam tiket ada tombol **Tutup Tiket**.

- `/ticket add user:@nama` — tambah orang ke tiket (staff).
- `/ticket remove user:@nama` — cabut akses (staff).
- `/ticket close` — tutup tiket dari dalam channel.

### Musik

1. Masuk ke voice channel.
2. Jalankan `/play query:judul lagu` atau `/play query:https://youtu.be/...`.
3. Bot join otomatis dan memutar lagu. Gunakan `/queue` untuk melihat antrean.
4. Jalankan `/shuffle` (atau klik tombol **🔀 Shuffle** di panel now playing) untuk mengaktifkan/mematikan mode acak. Mode ini bisa diaktifkan **sebelum** memutar lagu, jadi playlist/artis berikutnya langsung diputar acak sejak lagu pertama. Saat dimatikan, lagu kembali diputar berurutan. Lagu yang sedang diputar tidak ikut diacak.

Untuk Spotify, tempel link langsung ke `/play`:

```text
/play query:https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT
/play query:https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
```

> **Catatan Spotify:** Web API hanya bisa dipakai kalau akun **pemilik aplikasi di Spotify Developer Dashboard** punya langganan **Premium aktif**. Tanpa itu, semua panggilan API kena `403 — Active premium subscription required for the owner of the app`, dan bot jatuh ke halaman embed yang hanya memuat ~100 lagu pertama. Token anonim tidak bisa dipakai sebagai pengganti. Saat itu terjadi, embed `/play` menampilkan catatan dan audio tetap diambil dari YouTube.

Playlist/album akan dimasukkan seluruhnya ke antrean lalu diputar satu per satu. Secara default tidak ada batas; kalau `MUSIC_MAX_QUEUE` diisi angka positif, sisa lagu yang terlewat akan diberi tahu di embed.

Link **playlist/album/artis YouTube** dan **set/artis SoundCloud** juga didukung. Bot mengambil semua lagu dari link tersebut (tanpa batas, kecuali `MUSIC_MAX_QUEUE` diisi angka positif), bukan hanya lagu pertama:

```text
/play query:https://www.youtube.com/playlist?list=PL...
/play query:https://www.youtube.com/@NamaArtis
/play query:https://soundcloud.com/namaartis/sets/nama-album
```

Kalau mode shuffle aktif sebelum link ditempel, daftar lagu diacak dulu sehingga lagu pertama juga acak.

Tambahkan opsi `insert:true` untuk menaruh lagu di **paling atas** antrean (diputar setelah lagu yang sedang berjalan). Default `insert:false`, artinya lagu masuk ke paling akhir antrean:

```text
/play query:lagu favorit insert:true
/play query:https://youtu.be/... insert:true
```

Kalau antrean sedang kosong, `insert:true` dan `false` sama-sama langsung memutar lagu tersebut.

Lagu hasil `insert:true` (dan `/playnext`) tetap diprioritaskan walaupun mode shuffle aktif: lagu itu dimainkan lebih dulu, baru sisanya diacak.

**Saran otomatis (autocomplete):** saat mengetik minimal 2 huruf di opsi `query`, Discord menampilkan sampai 10 saran lagu beserta artis dan durasinya. Klik salah satu saran untuk langsung memutarnya.

- Kalau `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` diisi, saran diambil dari katalog Spotify dan yang diputar adalah lagu Spotify tersebut.
- Tanpa kredensial, saran diambil dari katalog Deezer, lalu dicari audionya di YouTube.
- Kalau semua sumber gagal, bot memakai saran pencarian YouTube.
- Hasil saran di-cache 3 menit agar tetap cepat dan tidak kena rate limit.

Secara default, bot otomatis keluar jika tidak ada lagu selama 2 menit atau voice channel kosong selama 45 detik. Gunakan `/musicconfig stay aktif:true` agar bot **tetap terhubung** di voice channel (mode 24/7 "tetap connected"): bot tidak keluar saat idle/kosong dan tidak memutar musik otomatis ketika antrean habis. `/stop` tetap mengeluarkan bot secara manual. Mode ini tidak mencakup auto-rejoin setelah bot restart atau koneksi voice terputus.

#### Mengatur antrean

```text
/playnext query:lagu favorit     # taruh tepat setelah lagu yang sedang diputar
/remove posisi:3                 # hapus lagu nomor 3
/move dari:5 ke:1                # pindahkan lagu ke posisi lain
/clear                           # kosongkan lagu yang menunggu
/shuffle                         # toggle mode acak on/off
/shuffle mode:on                 # paksa aktif
/shuffle mode:off                # paksa mati
```

Mode shuffle juga bisa di-toggle lewat tombol **Shuffle** di panel now playing. Saat aktif, tombol berubah menjadi hijau dengan label `Shuffle: On`.

Mode shuffle disimpan per server (bukan per antrean), jadi tetap aktif walaupun bot sempat keluar dari voice channel atau antrean dibuat ulang. Kalau `/shuffle mode:on` dijalankan saat belum ada musik, pengaturan tetap tersimpan dan dipakai saat `/play` berikutnya. Status shuffle juga terlihat di footer `/queue`.

Lagu yang sedang diputar tidak terpengaruh oleh `/remove`, `/move`, `/clear`, atau `/shuffle`.

### Polling

```text
/poll pertanyaan:"Makan apa?" pilihan:"Bakso | Mie | Sate" multi:false
```

Member memilih lewat tombol. Hasil dan jumlah suara langsung diperbarui. Pembuat polling (atau moderator dengan izin **Manage Messages**) bisa menutup polling lewat tombol **Tutup Poll**. Data polling disimpan di `data/polls.json` agar tombol tetap berfungsi setelah bot restart.

### Panel role

```text
/rolepanel create channel:#pilih-role roles:@Member,@Gamer,@Notifikasi
```

Panel berisi menu dropdown dengan role yang dipilih. Member memilih role untuk mengambilnya, lalu memilih role yang sama lagi untuk melepasnya. Role bot harus berada **di atas** role yang dibagikan.

### Pengingat

```text
/remindme waktu:10m pesan:Cek turnamen
/reminders
/remindcancel id:abcd1234
```

Format waktu: `10s`, `10m`, `2h`, `1d`, maksimal 30 hari. Pengingat dikirim di channel tempat command dibuat, atau lewat DM jika channel tersebut sudah tidak bisa diakses. Pengingat disimpan di `data/reminders.json` dan dipulihkan otomatis saat bot restart.

### Ulang tahun (birthday)

Anggota mendaftarkan tanggal lahirnya sendiri:

```text
/birthday set tanggal:19 bulan:11 tahun:2000 zona:WIT
/birthday timezone zona:Malaysia
/birthday view
/birthday view user:@nama
/birthday upcoming jumlah:5
/birthday privacy publik:false
/birthday remove
```

- `tahun` **opsional**. Tanpa tahun, bot hanya menyimpan tanggal + bulan dan umur tidak ditampilkan.
- `zona` menentukan **kapan ulang tahun dirayakan**. Bisa memakai nama singkat (`WIB`, `WITA`, `WIT`, `Malaysia`, `SGT`) atau IANA (`Asia/Jakarta`, `Asia/Makassar`, `Asia/Jayapura`, `Asia/Kuala_Lumpur`, `UTC`, dll). Ada autocomplete saat mengetik.
- Kalau `zona` tidak diisi, bot memakai zona yang tersimpan untuk member itu, atau **zona default server** yang diatur admin.
- `view`, `upcoming`, `timezone`, dan `privacy` bersifat ephemeral (hanya kamu yang melihat).
- `upcoming` hanya menampilkan ulang tahun yang diatur publik. Member bisa menyembunyikan datanya lewat `/birthday privacy publik:false`.
- Tanggal **29 Februari** dirayakan pada **1 Maret** saat tahun bukan tahun kabut.
- Data ulang tahun dihapus otomatis saat member keluar dari server.

Pengaturan server (butuh izin **Manage Server**):

```text
/birthdayconfig set channel:#ucapan role:@Birthday koin:500 zona:WIT pesan:"🎉 Selamat ulang tahun, {user}!"
/birthdayconfig status
/birthdayconfig test
/birthdayconfig off
```

- Tanpa `channel`, bot memakai system channel atau channel teks pertama yang bisa dikirimi pesan.
- `role` diberikan selama kurang lebih 24 jam lalu dicabut otomatis. Bot butuh izin **Manage Roles** dan role bot harus berada **di atas** role ulang tahun.
- `koin` adalah hadiah sekali per tahun lewat sistem ekonomi (default `0`).
- `test` hanya menampilkan pratinjau ucapan, tanpa memberi role atau koin.
- `zona` adalah zona waktu default untuk member yang belum mengatur zona pribadinya. Default awal mengikuti zona waktu komputer/hosting bot.
- Pengecekan berjalan tiap **10 menit** (mendukung banyak zona sekaligus), tepat tengah malam waktu bot, **dan** sekali saat bot start. Penanda `lastCelebrated` memakai tanggal **zona member itu sendiri**, sehingga ucapan/koin tidak dobel setelah restart.

Placeholder pesan: `{user}` (mention), `{username}`, `{displayName}`, `{server}`, `{age}`, dan `{date}`.

### Moderasi, warning & mod log

**Mod log** mencatat aksi moderasi ke channel khusus:

```text
/modlog set channel:#mod-log
/modlog status
/modlog test
/modlog off
```

Yang dicatat: ban, unban, kick, timeout, purge, slowmode, warning, lockdown, dan pembukaan lockdown. Riwayat juga disimpan lokal di `data/modactions.json`, jadi `/history` tetap bisa dipakai walau mod log dimatikan.

**Sistem warning:**

```text
/warn target:@nama alasan:"Spam link"
/warnings target:@nama
/clearwarn target:@nama id:abcd1234
/clearwarn target:@nama semua:true
/history target:@nama
```

Secara default, setiap **3 warning** bot otomatis memberi timeout **10 menit**. Atur lewat:

```text
/warnconfig threshold:3 timeout:10m auto:true
```

Auto timeout berlaku setiap kelipatan threshold (3, 6, 9, dst). Role bot harus berada di atas member yang di-timeout.

**Lockdown channel:**

```text
/lockdown start channel:#umum alasan:"Raid"
/lockdown status
/lockdown end channel:#umum
```

Lockdown mencabut izin kirim pesan/reaksi untuk `@everyone` dan menyimpan izin sebelumnya, lalu mengembalikannya saat `/lockdown end`. Data lockdown disimpan di `data/lockdowns.json`.

### Temp voice (join to create)

```text
/tempvoice setup channel:#Buat-Voice kategori:#Voice
/tempvoice status
/tempvoice disable
```

Setelah channel pemicu diatur, member yang join ke channel tersebut otomatis mendapat voice channel sementara dengan nama mereka. Channel dihapus otomatis sekitar 10 detik setelah kosong.

Pemilik channel (dan moderator dengan **Manage Channels**) bisa mengatur:

```text
/tempvoice name nama:"Mabar"
/tempvoice limit jumlah:10
/tempvoice lock
/tempvoice unlock
/tempvoice claim
```

`/tempvoice claim` dipakai untuk mengambil alih channel yang pemiliknya sudah keluar. Temp voice mewarisi izin dari kategori (atau channel pemicu jika tanpa kategori), jadi channel di kategori privat tetap privat. Data channel sementara disimpan di `data/tempvoice.json`, dibersihkan otomatis saat bot restart, dan record yang channelnya sudah dihapus manual ikut dirapikan saat `/tempvoice status` dijalankan.

### Giveaway

```text
/giveaway start hadiah:"Nitro 1 bulan" durasi:1d pemenang:1 channel:#giveaway
/giveaway start hadiah:"Steam key" durasi:2h role:@Member
/giveaway list
/giveaway end message_id:123456789012345678
/giveaway reroll message_id:123456789012345678
```

Peserta klik tombol **Ikut** / **Keluar**. Pemenang dipilih acak saat waktu habis. Jika bot restart, timer giveaway dipulihkan otomatis dari `data/giveaways.json`. Tombol **Ikut** bisa dibatasi dengan role syarat. `/giveaway reroll` memilih pemenang baru dan sebisa mungkin menghindari pemenang sebelumnya; `/giveaway list` menampilkan link langsung ke pesan giveaway.

### Leveling

```text
/levelconfig enabled:true
/levelconfig channel:#level-up announce:true cooldown:60
/rank
/rank user:@nama
/leaderboard jumlah:10
```

Setiap pesan memberi **15-25 XP** dengan cooldown default 60 detik. Naik level diumumkan di channel tempat chat, atau di channel khusus jika diatur. Rumus XP: level `L` butuh total `100 × L²` XP. Data disimpan di `data/levels.json`. Field **Pesan ber-XP** di `/rank` menghitung pesan yang benar-benar mendapat XP (bukan seluruh pesan).

### Starboard

```text
/starboard set channel:#starboard
/starboard config threshold:3 emoji:⭐ selfstar:false
/starboard status
/starboard off
```

Pesan yang mendapat reaction bintang sebanyak threshold akan dikirim ulang ke channel starboard. Jika reaction turun di bawah threshold, pesan starboard dihapus. Postingan starboard juga otomatis dihapus saat pesan aslinya dihapus.

> Tanpa **Message Content Intent**, isi teks pesan tidak terbaca bot dan starboard hanya menampilkan lampiran, embed, serta link ke pesan asli. Aktifkan intent di Developer Portal lalu set `MESSAGE_CONTENT_INTENT=true` di `.env` jika ingin teks lengkap.

### AFK

```text
/afk alasan:"Makan dulu"
```

Status AFK otomatis hilang saat kamu mengirim pesan lagi. Jika ada yang me-mention kamu, bot membalas dengan alasan dan waktu AFK. Status AFK juga dihapus saat member keluar dari server. Deteksi mention membutuhkan **Message Content Intent**; tanpa intent, balasan AFK hanya muncul untuk reply yang menyertakan mention.

### Server stats

```text
/serverstats setup
/serverstats setup kategori:#Statistik
/serverstats update
/serverstats status
/serverstats disable
```

Bot membuat empat voice channel statistik: jumlah member, manusia, bot, dan channel. Angka diperbarui setiap 10 menit dan saat member join/keluar. Channel statistik tidak bisa dimasuki member (Connect ditolak). Saat setup, bot menarik daftar member agar hitungan bot/human akurat. `/serverstats disable` menghapus channel statistik sekaligus kategori bawaan bot bila sudah kosong; kategori yang kamu buat sendiri tidak dihapus.

Jika YouTube berubah dan musik error, perbarui yt-dlp:

```powershell
npm run update:ytdlp
```

Jika error `Sign in to confirm you're not a bot`, yt-dlp butuh cookies akun YouTube yang sudah login:

1. Di browser yang sudah login YouTube, ekspor cookies dengan ekstensi mis. **Get cookies.txt LOCALLY** (format Netscape).
2. Upload file tersebut ke container, misalnya ke `/home/container/youtube-cookies.txt`.
3. Isi `YT_COOKIES_FILE=/home/container/youtube-cookies.txt` di `.env`, lalu restart bot.

Simpan file cookies itu di tempat privat — isinya setara sesi login. Jangan commit atau bagikan. Kalau bot-check masih muncul, coba tambahkan `YT_EXTRACTOR_ARGS=youtube:player_client=web_safari` (atau `android`) di `.env`.

yt-dlp menulis ulang cookie file setiap selesai, jadi file aslinya harus bisa dibaca oleh bot. Bot otomatis menyalin cookies ke direktori sementara yang writable saat start, jadi path di `YT_COOKIES_FILE` boleh berada di mount read-only (mis. `/home/container`). Salinan dibuat ulang setiap restart; file asli tidak pernah diubah.

Bot juga otomatis mencoba beberapa *player client* YouTube bila client utama ditolak. Urutan default-nya: `web_embedded`, `web_safari`, `mweb`, `android_vr`, `ios`, `tv_downgraded`. Kamu bisa menggantinya lewat `.env`:

```env
YT_PLAYER_CLIENTS=web_embedded,web_safari,mweb,android_vr,ios,tv_downgraded
```

Saat cookies dipakai, bot lebih dulu mencoba `youtube:player_client=default,web_embedded`. Ini workaround untuk bug yt-dlp [#17389](https://github.com/yt-dlp/yt-dlp/issues/17389) di mana client `tv_downgraded` (default saat login) menghasilkan error `The page needs to be reloaded`.

Urutan yang sama juga dipakai **saat streaming**. Jika satu mode gagal mengambil audio (misalnya `HTTP 403`), bot otomatis berpindah ke mode berikutnya sebelum lagu mulai diputar, sehingga satu client yang diblokir tidak langsung menggagalkan lagu. Mode yang berhasil saat pencarian lagu juga didahulukan saat streaming.

#### Spotify (opsional)

Tanpa kredensial, bot tetap mencoba membaca link Spotify lewat token anonim/halaman embed. Cara paling stabil adalah membuat aplikasi Spotify gratis:

1. Buka <https://developer.spotify.com/dashboard> lalu login.
2. Klik **Create app**, isi nama & deskripsi bebas, Redirect URI boleh `http://localhost:8888/callback`.
3. Buka aplikasi tersebut, salin **Client ID** dan **Client Secret**.
4. Isi di `.env`:

   ```env
   SPOTIFY_CLIENT_ID=isi_client_id
   SPOTIFY_CLIENT_SECRET=isi_client_secret
   ```

5. Restart bot (`npm start`).

Bot hanya memakai *Client Credentials* (tanpa login akun Spotify), jadi tidak butuh akun Premium. Playlist yang mau diputar harus **publik**.

### Ekonomi koin

```text
/balance [user]
/daily
/work
/pay user:@teman jumlah:100
/richest [jumlah:10]
```

Saldo disimpan per server di `data/economy.json`, jadi koin di server A tidak bercampur dengan server B.

| Sumber | Hadiah | Cooldown |
| --- | --- | --- |
| `/daily` | 250 koin | 24 jam |
| `/work` | 80–200 koin acak + nama pekerjaan | 60 menit |

- `/balance` menampilkan saldo, total koin yang pernah didapat, dan peringkatmu.
- `/pay` hanya menerima bilangan bulat positif, menolak transfer ke diri sendiri/bot, dan memastikan saldo cukup.
- `/richest` menampilkan hingga 25 member dengan koin terbanyak.

Jangan hapus `data/economy.json`; semua saldo member ada di sana.

### Fishing (mini game)

```text
/fish cast
/fish sell
/fish sell ikan:Goldfish jumlah:2
/fish bag
/fish shop
/fish buy jenis:rod item:steel
/fish buy jenis:bait item:shrimp jumlah:10
/fish equip rod:golden
/fish bait jenis:celestial
/fish guide
/fish stats
/fish supply
/fish leaderboard
```

Mini game mancing yang juga jadi sumber koin. Ada **30 spesies ikan berbahasa Inggris** dalam 6 rarity — semakin langka, semakin mahal.

| Rarity | Peluang dasar | Kisaran harga dasar |
| --- | --- | --- |
| ⚪ Common | 50% | 30–50 koin |
| 🟢 Uncommon | 28% | 120–200 koin |
| 🔵 Rare | 14% | 280–450 koin |
| 🟣 Epic | 6% | 650–1.100 koin |
| 🟡 Legendary | 1,8% | 1.600–3.000 koin |
| 🔴 Mythic | 0,2% | 4.500–8.000 koin |

- **Casting:** `/fish cast` memakai **1 bait** dan punya cooldown **30 detik**. Kalau bait habis, cast ditolak sampai kamu beli bait atau ambil bait gratis.
- **Bait:** pemula mendapat **10 Worm**. `/fish supply` memberi **5 Worm gratis tiap 6 jam** supaya tidak pernah buntu. Bait yang lebih mahal menaikkan peluang ikan langka *dan* nilai jual.
- **Rod (pancing):** 5 pilihan, dari Bamboo (gratis) sampai Celestial (28.000 koin). Rod lebih bagus menaikkan bobot ikan **Rare+** dan menurunkan Common/Uncommon. Rod yang dibeli langsung terpasang; `/fish equip` untuk berganti.
- **Efek gabungan:** `luck` rod + bait dijumlahkan. Dengan Celestial Rod + Celestial Bait (luck 2,4), peluang Mythic naik dari 0,2% menjadi ~0,6% dan peluang Rare+ jauh lebih besar.
- **Ukuran ikan:** setiap tangkapan punya ukuran acak (≈70–140% dari rata-rata spesies). Ikan besar dijual lebih mahal; rekor tangkapan tersimpan di `/fish stats`.
- **Menjual:** hasil tangkapan masuk tas (`/fish bag`). `/fish sell` menjual semua, atau `/fish sell ikan:<nama> jumlah:<n>` untuk sebagian. Harga jual = harga dasar × ukuran × bonus rod/bait.
- **Progresi:** `/fish guide` berisi daftar ikan + peluang, `/fish stats` statistik pribadi, dan `/fish leaderboard` urutan nelayan dengan koin terbanyak di server.
- Data memancing tersimpan per server di `data/fishing.json`.

### Mining (mini game)

```text
/mine dig
/mine sell
/mine sell ore:Diamond jumlah:2
/mine bag
/mine shop
/mine buy jenis:pickaxe item:iron
/mine buy jenis:light item:lantern jumlah:10
/mine equip pickaxe:diamond
/mine light jenis:crystal
/mine guide
/mine stats
/mine supply
/mine leaderboard
```

Mini game menambang yang juga jadi sumber koin. Ada **30 jenis ore berbahasa Inggris** dalam 6 rarity — semakin langka, semakin mahal dan semakin dalam lokasinya.

| Rarity | Peluang dasar | Kisaran harga dasar |
| --- | --- | --- |
| ⚪ Common | 50% | 35–55 koin |
| 🟢 Uncommon | 28% | 130–200 koin |
| 🔵 Rare | 14% | 300–470 koin |
| 🟣 Epic | 6% | 700–1.100 koin |
| 🟡 Legendary | 1,8% | 1.700–3.000 koin |
| 🔴 Mythic | 0,2% | 4.800–8.200 koin |

- **Digging:** `/mine dig` memakai **1 lampu** dan punya cooldown **45 detik**. Kalau lampu habis, dig ditolak sampai kamu beli lampu atau ambil lampu gratis.
- **Lampu (light):** pemula mendapat **10 Torch**. `/mine supply` memberi **5 Torch gratis tiap 6 jam** supaya tidak pernah buntu. Lampu yang lebih mahal menaikkan peluang ore langka *dan* nilai jual.
- **Pickaxe:** 5 pilihan, dari Wooden (gratis) sampai Celestial (28.000 koin). Pickaxe lebih bagus menaikkan bobot ore **Rare+**, menurunkan Common/Uncommon, dan menambah kedalaman galian. Pickaxe yang dibeli langsung terpasang; `/mine equip` untuk berganti.
- **Efek gabungan:** `luck` pickaxe + lampu dijumlahkan. Dengan Celestial Pickaxe + Star Light (luck 2,4), peluang Mythic naik dari 0,2% menjadi ~0,6% dan peluang Rare+ jauh lebih besar.
- **Berat ore:** setiap temuan punya berat acak (≈70–140% dari rata-rata jenisnya). Ore berat dijual lebih mahal; rekor temuan dan kedalaman terdalam tersimpan di `/mine stats`.
- **Menjual:** hasil galian masuk tas (`/mine bag`). `/mine sell` menjual semua, atau `/mine sell ore:<nama> jumlah:<n>` untuk sebagian. Harga jual = harga dasar × berat × bonus pickaxe/lampu.
- **Progresi:** `/mine guide` berisi daftar ore + peluang, `/mine stats` statistik pribadi, dan `/mine leaderboard` urutan penambang dengan koin terbanyak di server.
- Data menambang tersimpan per server di `data/mining.json`.

### Daily & Weekly Quest

```text
/quests daily
/quests weekly
/quests claim
/quests claim jenis:daily
/quests claim jenis:weekly
```

Misi harian dan mingguan yang progresnya **berjalan otomatis** dari aktivitas yang sudah ada — tidak perlu command tambahan untuk mencatat.

- **Daily:** 4 quest per hari, reset tiap tengah malam (waktu lokal bot).
- **Weekly:** 3 quest per minggu, reset tiap Senin 00:00.
- Pilihan quest ditentukan secara acak tapi **stabil** per server + user + periode, jadi tidak berubah saat bot restart. Satu board selalu berisi maksimal satu quest dari tiap aktivitas (mine, fish, gacha, battle, work).
- Sumber progres: `mine dig`/`mine sell`/`mine earn`/ore Epic+, `fish cast`/`fish sell`/`fish earn`/ikan Rare+, jumlah gacha, kemenangan duel kartu, dan `/work`.
- Hadiah diklaim lewat `/quests claim` (semua quest yang selesai sekaligus). Bisa dibatasi ke `daily` atau `weekly` saja dengan opsi `jenis`.
- Quest yang sudah diklaim tidak bisa diklaim ulang; hadiah masuk saldo koin lewat sistem ekonomi yang sama.
- Progres dan status klaim tersimpan per server di `data/quests.json`.

### Command hiburan

```text
/8ball pertanyaan:Apakah besok hujan?
/roll dadu:2d20
/coinflip [tebakan:angka|gambar]
/choose pilihan:Bakso | Mie | Sate
```

- `/roll` memakai format `NdM` (1–10 dadu, 2–100 sisi). Tanpa argumen otomatis `1d6`.
- `/choose` memisahkan opsi dengan `|`, minimal 2 dan maksimal 10 pilihan.

### Auto-publish pengumuman

```text
/autopublish on
/autopublish off
/autopublish status
```

Saat aktif, setiap pesan baru di **channel pengumuman** (Announcement Channel) langsung di-publish otomatis oleh bot. Butuh izin **Manage Messages** di channel tersebut dan hanya berlaku untuk pesan yang dikirim setelah fitur dinyalakan.

### Message log

```text
/messagelog set channel:#log-pesan
/messagelog events deleted:true edited:true
/messagelog status
/messagelog off
```

Bot mencatat pesan member yang **dihapus** dan **diedit** ke channel log: author, channel, isi sebelum/sesudah, dan link ke pesan asli. Pesan bot dan pesan di channel log itu sendiri diabaikan.

Tanpa **Message Content Intent**, isi pesan yang tidak ada di cache akan tampil sebagai *tidak tersedia*. Untuk hasil terbaik aktifkan intent tersebut (lihat catatan di bagian Starboard).

### Statistik bot

```text
/botstats
```

Menampilkan uptime, ping, jumlah server, ukuran cache user/channel, jumlah command, pemakaian memori, dan versi Node.js. Ukuran cache bisa lebih kecil dari jumlah sebenarnya di server besar.

### Gacha kartu

```text
/gacha
/gacha jumlah:10
/cards odds
/cards info nama:Naga Emas
/cards koleksi
/cards jual nama:Kucing Pasar jumlah:2
/cards upgrade nama:Naga Emas
/cards rank
```

Ada **62 kartu unik** dalam enam rarity. Setiap kartu punya ATK, DEF, SPD, HP, elemen, skill pasif, dan nilai jual. Koleksi **Celestial** berisi makhluk-makhluk paling langka (naga primordial, rubah dewa, dan gagak petir langit).

| Rarity | Peluang | Jumlah kartu | Nilai jual |
| --- | --- | --- | --- |
| ⚪ Common | 54% | 18 | 25 koin |
| 🔵 Rare | 26,5% | 14 | 75 koin |
| 🟣 Epic | 11,5% | 10 | 220 koin |
| 🟡 Legendary | 5% | 7 | 650 koin |
| 🔴 Mythic | 2,5% | 8 | 2.000 koin |
| 💠 Celestial | 0,5% | 5 | 6.000 koin |

- Harga: **150 koin** untuk 1 pull, **1.350 koin** untuk 10 pull (hemat 150).
- **Pity**: Epic+ dijamin setiap 10 pull tanpa Epic+, Legendary+ dijamin setiap 60 pull tanpa Legendary+, dan Celestial dijamin setiap 200 pull tanpa Celestial.
- Kartu duplikat tetap tersimpan sebagai salinan; kamu bisa menjualnya atau memakainya untuk upgrade level.
- `/cards odds` menampilkan peluang, pity, harga, skill elemen, aturan upgrade, dan aturan duel kapan saja.
- Nilai jual rata-rata sengaja lebih rendah dari harga pull, jadi gacha tetap menjadi *coin sink* yang sehat.

### Level, skill, dan upgrade

Setiap kartu bisa naik dari **Lv.1 sampai Lv.10**. Tiap level menambah **+8%** ke ATK, DEF, SPD, dan HP.

```text
/cards upgrade nama:Naga Emas
/cards info nama:Naga Emas
```

Biaya upgrade memakai **duplikat + koin**, dan naik mengikuti level sekarang:

| Naik ke | Duplikat | Koin |
| --- | --- | --- |
| Lv.2 | 1 | 150 |
| Lv.3 | 2 | 300 |
| Lv.4 | 3 | 450 |
| Lv.5 | 4 | 600 |
| Lv.6 | 5 | 750 |
| Lv.7 | 6 | 900 |
| Lv.8 | 7 | 1.050 |
| Lv.9 | 8 | 1.200 |
| Lv.10 | 9 | 1.350 |

- Satu salinan kartu selalu disisakan, jadi kartu tidak pernah hilang karena upgrade.
- Level tetap tersimpan saat kamu menjual sebagian duplikat; level baru dihapus kalau **semua** salinan terjual.
- `/cards info` menampilkan levelmu, stat efektif, skill, dan kebutuhan upgrade berikutnya.
- `/cards koleksi` menandai kartu yang sudah di atas Lv.1.

**Skill pasif per elemen** aktif otomatis saat duel:

| Elemen | Skill | Efek |
| --- | --- | --- |
| 🔥 Api | Bara Membara | Peluang crit naik dari 10% menjadi **25%** |
| 🌪️ Angin | Kelicap Angin | **15%** peluang menyerang dua kali dalam satu giliran |
| 🪨 Bumi | Perisai Batu | Damage yang diterima berkurang **15%** |
| 💧 Air | Arus Penyembuh | Memulihkan **6% HP maksimum** di akhir setiap ronde |

Skill membuat pilihan kartu bukan sekadar soal rarity: kartu Common dengan elemen yang tepat masih bisa mengalahkan kartu yang lebih tinggi lewat crit, serangan ganda, pertahanan, atau penyembuhan.

### Duel kartu

```text
/battle lawan:@teman kartu:Naga Emas taruhan:200
```

Alur duel:

1. Penantang memilih kartu dan taruhan. Koin **belum** dipotong pada tahap ini.
2. Lawan menekan **Terima & Pilih Kartu**, lalu memilih satu kartu dari koleksinya lewat menu.
3. Bot memotong taruhan kedua pemain, menjalankan simulasi ronde, dan membayar pemenang.
4. Pemenang mendapat **95% pot**; 5% dibakar sebagai pajak arena.

Aturan pertarungan:

- Taruhan **50–10.000 koin** per pemain.
- Kartu dengan **SPD** lebih tinggi menyerang lebih dulu setiap ronde.
- Keunggulan elemen memberi **+25% damage**: 🔥 Api → 🌪️ Angin → 🪨 Bumi → 💧 Air → 🔥 Api.
- Serangan kritis default **10%** (×1,6 damage); kartu **Api** menaikkannya menjadi **25%** lewat skill.
- Skill elemen lain menambah serangan ganda (**Angin**), pengurangan damage (**Bumi**), atau penyembuhan tiap ronde (**Air**).
- Maksimal **15 ronde**. Kalau keduanya bertahan, pemenang ditentukan dari persentase HP tersisa, lalu power kartu.
- Hasil menampilkan log tiap ronde, sisa HP, heal/serangan ganda, hadiah, dan update statistik menang/kalah/streak.

Tantangan berlaku **5 menit** dan hanya bisa direspons oleh lawan. Satu member tidak bisa punya lebih dari satu tantangan aktif. Tantangan disimpan di memori, jadi tantangan yang belum diterima akan hilang saat bot restart.

### Papan peringkat duel

```text
/cards rank
```

Menampilkan **10 duelis teratas** per server, diurutkan dari kemenangan, lalu streak terbaik, lalu total koin hadiah. Kalau kamu belum masuk 10 besar, posisimu tetap ditampilkan di bawah papan. Statistik ini juga muncul di `/cards koleksi`.

---

## Troubleshooting

| Masalah | Solusi |
| --- | --- |
| `DISCORD_TOKEN tidak valid` | Ambil token baru di Developer Portal > Bot > Reset Token. Pastikan mengambil **token bot**, bukan client secret. |
| `Bot butuh Server Members Intent` | Aktifkan **Server Members Intent** di Developer Portal > Bot > Privileged Gateway Intents, lalu simpan. |
| Slash command tidak muncul | Jalankan `npm run deploy` lalu restart bot. Kalau global, tunggu hingga 1 jam. Coba restart aplikasi Discord (Ctrl+R). |
| Saran lagu (autocomplete) tidak muncul | Setelah update, jalankan `npm run deploy` lalu restart bot. Autocomplete butuh minimal 2 huruf dan tidak aktif saat menempel URL. |
| Bot keluar dari voice padahal ingin 24/7 | Cek `/musicconfig status`. Aktifkan mode tetap terhubung dengan `/musicconfig stay aktif:true`. Setelah bot restart atau koneksi voice terputus, bot tidak auto-rejoin — jalankan `/play` lagi untuk masuk ke voice. `/stop` tetap mengeluarkan bot. |
| Command tidak merespons untuk member lain / akun kedua | Command umum & musik terbuka untuk semua member. Jalankan `npm run deploy` (atau restart bot) agar command tersinkron ke server, pastikan member punya izin **Use Application Commands** di channel, dan restart aplikasi Discord-nya. |
| `Gagal mendaftarkan command: Missing Access` | Bot belum diundang ke server tersebut, atau `DISCORD_GUILD_ID` salah. |
| Bot tidak bisa memberi auto role | Naikkan role bot di atas role yang mau diberikan (Server Settings > Roles). |
| Panel role gagal memberi role | Pastikan role bot di atas role panel dan bot punya izin **Manage Roles**. |
| Polling atau pengingat hilang setelah restart | Pastikan folder `data/` tidak dihapus dan ikut tersimpan di hosting. |
| Mod log tidak terkirim | Jalankan `/modlog set channel:#mod-log`, pastikan bot punya izin **Send Messages** dan **Embed Links** di channel itu. |
| Auto timeout warning tidak jalan | Pastikan role bot di atas member target dan bot punya izin **Moderate Members**. |
| Channel tidak bisa dibuka setelah lockdown | Jangan hapus `data/lockdowns.json`. Jalankan `/lockdown end` di channel tersebut. |
| Temp voice tidak dibuat saat join | Pastikan `/tempvoice setup` sudah dijalankan, channel pemicu berupa voice channel, dan bot punya izin **Manage Channels** + **Move Members**. |
| Temp voice tidak terhapus | Bot menghapusnya sekitar 10 detik setelah channel benar-benar kosong. Pastikan bot tetap online dan punya izin **Manage Channels**. |
| Giveaway tidak berakhir otomatis | Pastikan folder `data/` tersimpan. Setelah restart, timer dipulihkan dari `data/giveaways.json`; giveaway yang sudah lewat akan langsung diakhiri. |
| Starboard tidak menampilkan teks | Aktifkan **Message Content Intent** di Developer Portal, set `MESSAGE_CONTENT_INTENT=true` di `.env`, lalu restart bot. |
| XP tidak bertambah | Jalankan `/levelconfig enabled:true`. XP punya cooldown (default 60 detik) dan hanya dihitung dari pesan di server. |
| Ucapan ulang tahun tidak muncul | Cek `/birthdayconfig status` dan `/birthday view`. Pastikan fitur aktif, channel bisa dikirimi pesan, dan zona waktu sudah sesuai (bisa beda dengan zona bot). Bot mengecek tiap 10 menit. |
| Role ulang tahun tidak dicabut | Pastikan bot tetap online dan punya izin **Manage Roles** dengan role bot di atas role ulang tahun. |
| Server stats tidak berubah | Pastikan `/serverstats setup` sudah dijalankan dan bot punya izin **Manage Channels**. Perubahan nama channel dibatasi rate limit Discord, jadi tunggu beberapa menit. |
| Saldo koin hilang setelah restart | Jangan hapus `data/economy.json`. File itu dibuat otomatis dan menyimpan saldo semua member. |
| `/daily` atau `/work` bilang belum waktunya | Cooldown bersifat nyata (24 jam / 60 menit). Waktu selesai ditampilkan di pesan. |
| Auto-publish tidak jalan | Pastikan channel-nya **Announcement Channel**, `/autopublish on` sudah dijalankan, dan bot punya izin **Manage Messages**. Pesan lama tidak ikut ter-publish. |
| Message log kosong atau isi pesan "tidak tersedia" | Jalankan `/messagelog status` untuk memastikan channel sudah diatur dan event aktif. Isi pesan butuh **Message Content Intent** (`MESSAGE_CONTENT_INTENT=true` + aktif di Developer Portal). |
| Kartu atau salinan hilang setelah restart | Jangan hapus `data/cards.json`. File itu menyimpan koleksi, level, pity, dan statistik duel semua member. |
| `/gacha` bilang koin tidak cukup | Kumpulkan koin lewat `/daily` dan `/work`, atau jual salinan kartu dengan `/cards jual`. |
| `/cards upgrade` bilang duplikat kurang | Butuh duplikat sebanyak level sekarang (Lv.1→2 butuh 1, Lv.2→3 butuh 2, dst.). Tarik lebih banyak kartu dan sisakan minimal satu salinan. |
| Level kartu hilang | Level menempel pada kartu. Kalau semua salinan dijual, levelnya ikut terhapus. Sisakan minimal satu salinan. |
| `/cards rank` kosong | Papan peringkat baru terisi setelah ada duel yang selesai di server. Mulai dengan `/battle`. |
| Kartu tidak muncul saat `/battle` | Kamu hanya bisa memakai kartu yang dimiliki. Tarik kartu dulu dengan `/gacha`. |
| Tombol duel bilang tantangan tidak aktif | Tantangan kedaluwarsa setelah 5 menit, atau bot baru restart. Buat tantangan baru dengan `/battle`. |
| Duel tidak bisa diterima | Pastikan saldo kamu cukup, kamu punya minimal satu kartu, dan belum ada tantangan lain yang aktif. |
| Bot tidak bisa login setelah update | Intent baru tidak butuh portal, tetapi **Server Members Intent** tetap wajib. Jika memakai `MESSAGE_CONTENT_INTENT=true`, aktifkan juga **Message Content Intent**. |
| Musik error / tidak ada suara | Cek bot punya izin Connect + Speak di voice channel. Jalankan `npm run update:ytdlp`. |
| Command melambat + lagu gagal satu per satu dari playlist | Pastikan `YT_COOKIES_FILE` berisi path yang benar-benar ada di mesin bot (atau kosongkan). Bot sekarang mengabaikan config yt-dlp lokal yang basi dan berhenti setelah 3 kegagalan berturut-turut supaya tidak membanjiri event loop. Batasi juga `MUSIC_MAX_QUEUE` (disarankan `200`). |
| `Sign in to confirm you're not a bot` | Isi `YT_COOKIES_FILE` dengan path `cookies.txt` yang diekspor dari browser yang sudah login YouTube (lihat bagian Musik). |
| `OSError: [Errno 30] Read-only file system: .../cookies.txt` | Bot sudah menyalin cookies ke temp writable otomatis. Pastikan file asli masih bisa dibaca dan restart bot; jika tetap muncul, kosongkan `YT_COOKIES_FILE`. |
| Lagu tertentu gagal | Video bisa saja age-restricted, region-locked, atau sudah dihapus. Coba lagu lain. |
| Link Spotify gagal / `Spotify butuh kredensial` | Isi `SPOTIFY_CLIENT_ID` dan `SPOTIFY_CLIENT_SECRET` di `.env` (lihat bagian Spotify), pastikan playlist publik, lalu restart bot. |
| `ffmpeg-static` gagal download saat install | Jalankan `npm install` ulang dengan koneksi stabil, atau install ffmpeg manual dan set path-nya. |
| Binary `ffmpeg`/`yt-dlp` tidak ada setelah `npm install` | npm versi baru kadang memblokir install script. Jalankan `npm install-scripts approve --all` lalu `npm install` lagi. |
| PowerShell: `npm.ps1 cannot be loaded because running scripts is disabled` | Jalankan `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` sekali, atau pakai `npm.cmd install`, `npm.cmd start`, dst. |

---

## Struktur proyek

```text
.
├── .env.example            # template konfigurasi
├── package.json
├── scripts/
│   └── update-ytdlp.js     # perbarui binary yt-dlp
├── data/                   # dibuat otomatis: settings, polls, reminders, dll.
└── src/
    ├── index.js            # entry point bot
    ├── deploy-commands.js  # registrasi slash command
    ├── config.js           # loader & validasi .env
    ├── commands/           # slash command, dikelompokkan per kategori
    │   ├── general/        # ping, help, info server/user, botstats
    │   ├── community/      # poll, role panel, reminder, giveaway, AFK, rank
    │   ├── economy/        # balance, daily, work, pay, richest
    │   ├── fun/            # 8ball, roll, coinflip, choose, fish & mine (mini game), quests
    │   ├── cards/          # gacha, koleksi/info/jual/odds, duel
    │   ├── moderation/
    │   ├── music/
    │   ├── settings/       # embed, autorole, temp voice, leveling, starboard, stats, autopublish, messagelog
    │   └── ticket/
    ├── events/             # event Discord (ready, interaksi, member, voice, pesan, reaction)
    ├── handlers/           # loader command/event + router interaksi
    ├── lib/                # helper (embed, settings, guard, ekonomi, kartu, ulang tahun, message log, dsb.)
    └── music/
        ├── manager.js      # antrean, koneksi voice, streaming audio
        ├── spotify.js      # resolver link/playlist Spotify
        └── suggestions.js  # saran lagu untuk autocomplete /play
```

Settings per server disimpan di `data/settings.json`. Data lain dibuat otomatis: polling (`polls.json`), pengingat (`reminders.json`), riwayat moderasi (`modactions.json`), warning (`warnings.json`), lockdown (`lockdowns.json`), temp voice (`tempvoice.json`), giveaway (`giveaways.json`), leveling (`levels.json`), starboard (`starboard.json`), AFK (`afk.json`), ekonomi (`economy.json`), kartu (`cards.json`), fishing (`fishing.json`), mining (`mining.json`), quest (`quests.json`), dan ulang tahun (`birthdays.json`). Semua file ini tidak ikut git.

---

## Menambah command baru

Buat file di `src/commands/<kategori>/nama.js`:

```js
import { SlashCommandBuilder, InteractionContextType } from "discord.js";
import { ok } from "../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("halo")
    .setDescription("Contoh command baru")
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.reply({ embeds: [ok("Halo juga! 👋")] });
  },
};
```

Lalu jalankan `npm run deploy` dan restart bot. Command otomatis terdeteksi tanpa mengubah kode lain.

---

## Keamanan

- Jangan pernah membagikan `DISCORD_TOKEN`. Kalau bocor, segera **Reset Token** di Developer Portal.
- File `.env` dan folder `data/` sudah di-ignore oleh git.
- Untuk production, jalankan bot di mesin/VPS dengan akses terbatas dan gunakan process manager (mis. `pm2` atau Windows Service).
