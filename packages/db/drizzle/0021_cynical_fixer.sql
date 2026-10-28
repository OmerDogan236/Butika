CREATE TABLE "retailer_request_gates" (
	"origin" text PRIMARY KEY NOT NULL,
	"next_request_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
