CREATE TABLE "butikcan_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"result" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
