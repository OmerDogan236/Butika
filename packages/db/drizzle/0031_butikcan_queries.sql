CREATE TABLE "butikcan_queries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"turn_count" integer NOT NULL,
	"market" text NOT NULL,
	"boutique_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "butikcan_queries_query_idx" ON "butikcan_queries" USING btree ("query");--> statement-breakpoint
CREATE INDEX "butikcan_queries_created_idx" ON "butikcan_queries" USING btree ("created_at" DESC NULLS LAST);