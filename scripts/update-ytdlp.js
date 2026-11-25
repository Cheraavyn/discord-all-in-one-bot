import youtubedl from "youtube-dl-exec";

console.log("Memperbarui binary yt-dlp...");

try {
  const result = await youtubedl.update();
  const output = (result?.stdout ?? "").toString().trim();
  console.log(output || "yt-dlp sudah versi terbaru.");
} catch (error) {
  console.error("Gagal memperbarui yt-dlp:", error.stderr ?? error.message);
  process.exitCode = 1;
}
