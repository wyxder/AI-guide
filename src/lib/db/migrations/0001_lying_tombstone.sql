CREATE TABLE "qa_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sentiment" text DEFAULT 'neutral' NOT NULL,
	"rating" integer,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer,
	"title" text NOT NULL,
	"discount_value" text NOT NULL,
	"expiry_date" text NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'anonymous',
	"query" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "avatar_configs" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD COLUMN "cover_url" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD COLUMN "embedding" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" varchar(32) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "user_spot_route_unique" UNIQUE("user_id","spot_id","route_id");