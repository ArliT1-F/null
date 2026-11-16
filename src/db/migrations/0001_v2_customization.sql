ALTER TYPE "public"."media_kind" ADD VALUE IF NOT EXISTS 'FONT';--> statement-breakpoint
ALTER TYPE "public"."media_kind" ADD VALUE IF NOT EXISTS 'VIDEO';--> statement-breakpoint
CREATE TABLE "profile_custom_css" (
	"profile_id" text PRIMARY KEY NOT NULL,
	"draft_css" text DEFAULT '' NOT NULL,
	"published_css" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(60) NOT NULL,
	"tokens" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_custom_css" ADD CONSTRAINT "profile_custom_css_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_themes" ADD CONSTRAINT "saved_themes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_themes_user_created_idx" ON "saved_themes" USING btree ("user_id","created_at");