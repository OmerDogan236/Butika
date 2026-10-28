# Secrets

Bu dizin Hetzner sunucusundaki üretim ortamı için Docker Secrets dosyalarını barındırır. **Git'e commit edilmez** (kök `.gitignore` tarafından dışlanır, sadece bu README ve `.gitkeep` izlenir).

## Üretim sunucusunda oluşturma

```bash
mkdir -p /home/deploy/butika/infra/secrets
cd /home/deploy/butika/infra/secrets
chmod 700 .

openssl rand -base64 32 > postgres_password
openssl rand -base64 48 > jwt_secret
openssl rand -base64 24 > minio_user
openssl rand -base64 48 > minio_password
openssl rand -base64 24 > admin_initial_password

chmod 600 *
```

`docker-compose.prod.yml` bu dosyaları `docker secret` mekanizmasıyla container'lara `/run/secrets/<isim>` yolundan sunar.

## Gerekli secret listesi

| Dosya | İçerik | Kullanan |
|---|---|---|
| `postgres_password` | Postgres `butika` kullanıcı şifresi | `postgres`, `api`, `backup` |
| `jwt_secret` | API JWT imzalama anahtarı | `api` |
| `minio_user` | MinIO root kullanıcı adı | `minio`, `api`, `admin` |
| `minio_password` | MinIO root şifresi | `minio`, `api`, `admin` |
| `admin_initial_password` | Seed sırasında oluşturulan admin şifresi | `api` (seed komutu) |

> Yerel geliştirme bunlara ihtiyaç duymaz — `docker-compose.dev.yml` inline default'lar kullanır.
