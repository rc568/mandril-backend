CREATE TYPE "public"."user_role" AS ENUM('superadmin', 'admin', 'employee', 'customer');--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"password" varchar(128) NOT NULL,
	"user_name" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"user_role" "user_role" DEFAULT 'employee' NOT NULL,
	"refresh_token" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "user_userName_unique" UNIQUE("user_name"),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
