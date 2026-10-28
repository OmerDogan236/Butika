CREATE TABLE "detayli_test_cevaplari" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"test_surumu" integer NOT NULL,
	"cevaplar" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detayli_test_cevaplari" ADD CONSTRAINT "detayli_test_cevaplari_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;