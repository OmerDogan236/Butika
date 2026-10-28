// .env.production'daki DATABASE_URL'den yalnız veritabanı adını çıkarır. Dosyayı çalıştırmaz,
// source etmez: dosya stdin'den okunur, değer gerçek URL ayrıştırıcısıyla (WHATWG URL) çözülür.
// Başarıda stdout'a yalnız ad yazılır. Tek, açık ve desteklenen bir tanım yoksa ya da ad izinli
// biçimde değilse yalnız genel bir hata yazılır; satır, URL ve ayrıştırıcı hatası asla yazılmaz.
// Sunucuda (docs/push-onkontrol.md):
//   docker exec -i butika-api bun -e "$(cat /tmp/db-adi-oku.js)" < /opt/butika/.env.production
const fs = require("node:fs");

function fail() {
  console.error("HATA: DATABASE_URL guvenle cozumlenemedi. Dur; dosyayi yetkili kisi sunucuda yerelde incelesin.");
  process.exit(1);
}

function databaseName() {
  const DQ = String.fromCharCode(34);
  const SQ = String.fromCharCode(39);
  const CR = String.fromCharCode(13);
  const lines = fs.readFileSync(0, "utf8").split(String.fromCharCode(10)).map((l) => (l.endsWith(CR) ? l.slice(0, -1) : l));

  // Every line that defines the key counts, in any form (spaces, "export"): exactly one, and
  // only in the plain form DATABASE_URL=<value>.
  const keyOf = (line) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || !trimmed.includes("=")) return null;
    let key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    if (key.startsWith("export ")) key = key.slice(7).trim();
    return key;
  };
  const definitions = lines.filter((line) => keyOf(line) === "DATABASE_URL");
  if (definitions.length !== 1 || !definitions[0].startsWith("DATABASE_URL=")) return null;

  let value = definitions[0].slice("DATABASE_URL=".length);
  if (value.startsWith(DQ) || value.startsWith(SQ)) {
    if (value.length < 2 || !value.endsWith(value[0])) return null;
    value = value.slice(1, -1);
  }
  // Nothing another reader could take differently: no quote left, no space, no comment and no
  // variable expansion.
  for (const ch of [DQ, SQ, " ", String.fromCharCode(9), "#", "$", "`"]) if (value.includes(ch)) return null;
  if (value === "") return null;

  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
  if (url.hash !== "" || url.searchParams.has("dbname") || !url.pathname.startsWith("/")) return null;
  // One path segment, and only a plain database name: nothing else of the address is printed.
  const name = url.pathname.slice(1);
  return /^[A-Za-z0-9_-]{1,63}$/.test(name) ? name : null;
}

let name = null;
try {
  name = databaseName();
} catch (_) {
  name = null;
}
if (name === null) fail();
console.log(name);
