CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_user_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "saved_product_collections" (
	"saved_product_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_product_collections_saved_product_id_collection_id_pk" PRIMARY KEY("saved_product_id","collection_id")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_product_collections" ADD CONSTRAINT "saved_product_collections_saved_product_id_saved_products_id_fk" FOREIGN KEY ("saved_product_id") REFERENCES "public"."saved_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_product_collections" ADD CONSTRAINT "saved_product_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collections_user_sort_idx" ON "collections" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "saved_product_collections_collection_added_idx" ON "saved_product_collections" USING btree ("collection_id","added_at" DESC NULLS LAST);