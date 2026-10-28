CREATE TABLE "kullanici_profilleri" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tarz" jsonb NOT NULL,
	"butce" jsonb NOT NULL,
	"kategoriler" jsonb NOT NULL,
	"urun_etiketleri" jsonb NOT NULL,
	"yas_araligi" text,
	"kayit_sayisi" integer NOT NULL,
	"kaynak" text NOT NULL,
	"guncellendi" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kullanici_profilleri" ADD CONSTRAINT "kullanici_profilleri_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kullanici_profilleri_kaynak_idx" ON "kullanici_profilleri" USING btree ("kaynak");