CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"boutique_id" uuid NOT NULL,
	"url" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_url_created_idx" ON "comments" USING btree ("url","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_boutique_created_idx" ON "comments" USING btree ("boutique_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_user_created_idx" ON "comments" USING btree ("user_id","created_at" DESC NULLS LAST);