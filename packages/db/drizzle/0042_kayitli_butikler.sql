CREATE TABLE "kayitli_butikler" (
	"user_id" uuid NOT NULL,
	"boutique_id" uuid NOT NULL,
	"kaynak" text DEFAULT 'uygulama' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kayitli_butikler_user_id_boutique_id_pk" PRIMARY KEY("user_id","boutique_id")
);
--> statement-breakpoint
ALTER TABLE "boutiques" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "boutiques" ADD COLUMN "kullanici_durumu" text;--> statement-breakpoint
ALTER TABLE "boutiques" ADD COLUMN "ekleyen_user_id" uuid;--> statement-breakpoint
ALTER TABLE "kayitli_butikler" ADD CONSTRAINT "kayitli_butikler_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kayitli_butikler" ADD CONSTRAINT "kayitli_butikler_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kayitli_butikler_user_created_idx" ON "kayitli_butikler" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "boutiques_instagram_idx" ON "boutiques" USING btree ("instagram");