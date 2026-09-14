CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "guests_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"secret_hash" text NOT NULL,
	"adopted_by_user_id" uuid,
	"adopted_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_adopted_by_user_id_users_id_fk" FOREIGN KEY ("adopted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guests_number_key" ON "guests" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "guests_secret_hash_key" ON "guests" USING btree ("secret_hash");