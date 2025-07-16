CREATE TABLE IF NOT EXISTS "ai-app-template_user_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DROP TABLE "ai-app-template_request";--> statement-breakpoint
DROP INDEX IF EXISTS "chat_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "message_chat_id_idx";--> statement-breakpoint
ALTER TABLE "ai-app-template_chat" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai-app-template_message" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "ai-app-template_message" ALTER COLUMN "order" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "ai-app-template_message" ALTER COLUMN "parts" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai-app-template_user_request" ADD CONSTRAINT "ai-app-template_user_request_user_id_ai-app-template_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ai-app-template_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "ai-app-template_message" DROP COLUMN IF EXISTS "content";